
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { argon2id } from '@noble/hashes/argon2';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes, concatBytes } from '@noble/hashes/utils';
import { split, combine } from 'shamir-secret-sharing';
import { CreateSharesRequest, CreateSharesResult, RestoreSecretResult, RestoreSecretRequest, EncryptedInstruction, DecryptInstructionRequest, DecryptInstructionResult, RawInstruction, ParsedShare } from './types';
import { Buffer } from 'buffer';
import { gzip, ungzip } from 'pako';
import { mnemonicToEntropy, entropyToMnemonic, validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';

const SALT_LENGTH = 16;
const ARGON2_MEM_COST = 65536; // 64MB
const ARGON2_TIME_COST = 4;
const ARGON2_PARALLELISM = 1;
const KEY_LENGTH = 32;

const NONCE_LENGTH = 24;

// Upper bound on a share string accepted by parseShare. QR Qards top out near
// 1,400 characters, but the app also produces text-file backups for secrets
// too large for a QR code, so this ceiling is deliberately generous — its job
// is to reject pathological input (a multi-megabyte paste or a wrong file)
// before we spend work on SHA-256, base64 decoding, Shamir, and Argon2id.
// Never lower this: any Qard ever generated must keep parsing forever.
const MAX_SHARE_LENGTH = 262_144; // 256 KB

// Creation-side companion to MAX_SHARE_LENGTH: cap the compressed payload so a
// generated share (base64, ~4/3 expansion) always stays comfortably below the
// parse ceiling — a Qard we create today must be readable tomorrow.
const MAX_COMPRESSED_PAYLOAD = 150_000;

/**
 * Share-format version written into every new share as a `v=` segment
 * (first metadata segment, covered by the SHA-256 hash). Shares with no
 * `v=` segment are legacy (pre-v1.14) and parse under the old rules.
 * v=1 means: payload is zero-padded to PAYLOAD_PAD_BUCKET multiples.
 */
export const SHARE_FORMAT_VERSION = 1;

/**
 * XChaCha20-Poly1305 preserves plaintext length, and every Shamir share is
 * full-ciphertext length — so without padding, a single Qard leaks the
 * approximate size of the secret (a 12-word and a 24-word seed become
 * distinguishable from one stolen card). Zero-padding the COMPRESSED payload
 * up to multiples of this bucket hides that: an observer learns only
 * "at most N buckets". 192 bytes puts every common seed-phrase payload
 * (12/24 words, with or without label) in the same first bucket while
 * keeping QR density comfortably inside limits.
 *
 * Why zeros, and why after gzip: padding must follow compression (gzip
 * would collapse it), and both deployed decompressors tolerate trailing
 * zeros after a gzip stream — pako skips trailing NUL bytes (zlib's
 * documented tar-padding behavior; non-zero bytes would error) and Rust's
 * flate2 GzDecoder never reads past the gzip footer at all. That makes
 * padded payloads restorable by every already-shipped decoder, including
 * recover.html copies stored with estate documents. Never change the
 * padding byte from 0x00 without a new format version.
 */
export const PAYLOAD_PAD_BUCKET = 192;

/** Zero-pad a compressed payload up to the next PAYLOAD_PAD_BUCKET multiple. */
export function padPayload(compressed: Uint8Array): Uint8Array {
    const target = Math.max(
        PAYLOAD_PAD_BUCKET,
        Math.ceil(compressed.length / PAYLOAD_PAD_BUCKET) * PAYLOAD_PAD_BUCKET,
    );
    if (target === compressed.length) return compressed;
    const padded = new Uint8Array(target); // zero-filled by construction
    padded.set(compressed);
    return padded;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Valid BIP-39 phrase lengths, longest first (greedy prefers longer matches).
const MNEMONIC_WORD_COUNTS = [24, 21, 18, 15, 12];

// Greedily partitions a flat word stream into consecutive valid BIP-39 phrases,
// preferring longer phrases at each position. Returns the chunk phrases, or null
// if the words don't partition cleanly into valid mnemonics with nothing left over.
function greedyChunkMnemonics(words: string[]): string[] | null {
    const chunks: string[] = [];
    let currentIndex = 0;
    while (currentIndex < words.length) {
        let foundChunk = false;
        for (const count of MNEMONIC_WORD_COUNTS) {
            if (currentIndex + count <= words.length) {
                const phrase = words.slice(currentIndex, currentIndex + count).join(' ');
                if (validateMnemonic(phrase, wordlist)) {
                    chunks.push(phrase);
                    currentIndex += count;
                    foundChunk = true;
                    break;
                }
            }
        }
        if (!foundChunk) {
            // If no valid chunk can be formed from the current position, fail.
            return null;
        }
    }

    // If we have no valid chunks, or if we didn't consume all words, it's not a clean set of mnemonics.
    if (chunks.length === 0 || currentIndex !== words.length) {
        return null;
    }
    return chunks;
}

// Attempts to convert one or more concatenated BIP-39 phrases to a single entropy buffer.
// Returns an object with the combined entropy and the original chunks, or null if it fails.
//
// A user pasting several phrases almost always puts one phrase per line, so we honor those
// newline boundaries first: if every non-empty line is itself a complete valid mnemonic, that
// grouping wins. Only when the line split doesn't yield a clean set (e.g. everything on one
// line, or a single phrase wrapped across several lines) do we fall back to a greedy scan over
// the whole word stream. Honoring the user's line breaks avoids silently merging two shorter
// phrases into one longer one whenever the concatenation happens to pass its checksum.
export function tryGetEntropy(str: string): { entropy: Buffer; chunks: string[] } | null {
    let chunks: string[] | null = null;

    // 1) Prefer the user's explicit line grouping: each non-empty line must be a full valid phrase.
    const lines = str.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 0) {
        const perLineChunks: string[] = [];
        let allLinesValid = true;
        for (const line of lines) {
            const lineWords = line.split(/\s+/).filter(Boolean);
            const phrase = lineWords.join(' ');
            if (MNEMONIC_WORD_COUNTS.includes(lineWords.length) && validateMnemonic(phrase, wordlist)) {
                perLineChunks.push(phrase);
            } else {
                allLinesValid = false;
                break;
            }
        }
        if (allLinesValid) {
            chunks = perLineChunks;
        }
    }

    // 2) Fall back to a greedy scan over the whole word stream.
    if (!chunks) {
        const words = str.replace(/\n/g, ' ').trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            return null;
        }
        chunks = greedyChunkMnemonics(words);
    }

    if (!chunks) {
        return null;
    }

    try {
        // Convert each valid mnemonic chunk to entropy and concatenate
        const entropies = chunks.map(chunk => mnemonicToEntropy(chunk, wordlist));
        const entropy = Buffer.concat(entropies); // concat copies, so the sources can be wiped
        entropies.forEach(e => e.fill(0));
        return { entropy, chunks };
    } catch (e) {
        // This catch is for any unexpected errors during conversion.
        return null;
    }
};


async function deriveKey(password: string, salt: Uint8Array, keyfile?: Uint8Array): Promise<Uint8Array> {
    const passwordBytes = textEncoder.encode(password);
    const inputBytes = keyfile ? concatBytes(passwordBytes, keyfile) : passwordBytes;

    try {
        return await argon2id(inputBytes, salt, {
            m: ARGON2_MEM_COST,
            t: ARGON2_TIME_COST,
            p: ARGON2_PARALLELISM,
            dkLen: KEY_LENGTH,
        });
    } finally {
        passwordBytes.fill(0);
        // inputBytes is a new buffer only when keyfile is present (concatBytes); zero it too
        if (keyfile) inputBytes.fill(0);
    }
}

function getSetIdForShare(salt: Uint8Array): string {
    const saltBase64 = Buffer.from(salt).toString('base64');
    return saltBase64.substring(0, 8);
}

// ── BIP-32 master fingerprint (XFP) ──
// Computes the 4-byte BIP-32 master fingerprint shown by most hardware wallets
// on their home screen after import. Uses an empty BIP-39 passphrase — if the
// user adds a passphrase at wallet-import time, the on-device fingerprint will
// differ. Returns 8 uppercase hex characters (e.g. "ABCD1234"), or null if the
// phrase is not a valid BIP-39 mnemonic.
export function masterFingerprint(mnemonic: string): string | null {
    const normalized = mnemonic.trim().split(/\s+/).join(' ');
    if (!validateMnemonic(normalized, wordlist)) return null;
    const seed = mnemonicToSeedSync(normalized, '');
    let hd: HDKey | undefined;
    try {
        hd = HDKey.fromMasterSeed(seed);
        return (hd.fingerprint >>> 0).toString(16).padStart(8, '0').toUpperCase();
    } finally {
        seed.fill(0);
        // The HDKey derived from the seed holds the master private key; only
        // the 4-byte fingerprint is wanted here, and it stays readable after
        // wiping. Note the library's wipePrivateData() clears the private key
        // but leaves chainCode in place — not enough to spend, but not nothing.
        hd?.wipePrivateData();
    }
}

// ── Secret-leak guard (the Bob chat forwards messages to Google Gemini) ──

/**
 * Heuristic: does this text look like a secret the user must never paste
 * into the Bob chat? Flags a seQRets Qard/share (`seQRets|…`) or a run of
 * consecutive BIP-39 wordlist words (a seed phrase). The word-run threshold
 * is conservative to avoid tripping on ordinary prose.
 */
export function looksLikeSecret(text: string): boolean {
    if (/seqrets\|/i.test(text)) return true;
    const words = new Set(wordlist);
    let run = 0;
    for (const token of text.toLowerCase().split(/[^a-z]+/)) {
        if (token && words.has(token)) {
            run += 1;
            if (run >= 11) return true;
        } else if (token) {
            run = 0;
        }
    }
    return false;
}

// ── SHA-256 share integrity helpers ──

export function computeShareHash(input: string): string {
    const bytes = textEncoder.encode(input);
    const hashBytes = sha256(bytes);
    return Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Append a SHA-256 segment to the END of the share string. The hash
 * input is everything before the appended segment, so any optional
 * metadata passed in is covered by the hash. NOTE: this is an UNKEYED hash
 * that travels with the share — it detects accidental corruption or damage,
 * not deliberate tampering (an attacker who edits the share can recompute a
 * matching hash).
 *
 *   "seQRets|salt|data"                       → "seQRets|salt|data|sha256:H"
 *   "seQRets|salt|data|v=1|t=3|n=5|i=2"       → "seQRets|salt|data|v=1|t=3|n=5|i=2|sha256:H"
 *
 * Putting the hash last means manual verification is trivial:
 *   echo -n "<everything before |sha256:>" | shasum -a 256
 *
 * `parseShare` still accepts the legacy v1.11.0 layout where `sha256:`
 * sat at index 3 between data and metadata, so existing test Qards
 * continue to verify.
 */
export function appendShareHash(coreWithMaybeMeta: string): string {
    const hash = computeShareHash(coreWithMaybeMeta);
    return `${coreWithMaybeMeta}|sha256:${hash}`;
}

export function truncateHash(fullHex: string): string {
    return `${fullHex.slice(0, 8)}...${fullHex.slice(-8)}`;
}

/**
 * Parse a share string in any supported shape:
 *   • 3 segments (legacy, no hash):                  seQRets|salt|data
 *   • 4 segments (hash, no meta):                    seQRets|salt|data|sha256:H
 *   • 4+ segments (v1.14+ current, hash last):       seQRets|salt|data|v=1|t=K|n=N|i=I|sha256:H
 *   • 4+ segments (pre-v1.14, no version):           seQRets|salt|data|t=K|n=N|i=I|sha256:H
 *   • 4+ segments (legacy v1.11.0, hash before meta): seQRets|salt|data|sha256:H|t=K|n=N|i=I
 *
 * The hash, when present, lives in the `sha256:` segment which can sit
 * at index 3 (legacy) or at the last index (current). Everything else
 * past index 2 is optional metadata of the form "key=value".
 *
 * The `v=` segment, when present, is the share-format version (see
 * SHARE_FORMAT_VERSION). Absent = legacy rules. A version above the
 * current one throws a clear "update your software" error — that beats
 * a silent misparse on a frozen artifact like a steel plate.
 *
 * The hash covers seQRets|salt|data + the meta segments (in their
 * serialized order, with the sha256 segment removed). All layouts
 * produce the same hash input, so a Qard generated under any layout
 * verifies correctly here.
 */
export function parseShare(shareString: string): ParsedShare {
    if (shareString.length > MAX_SHARE_LENGTH) {
        throw new Error('This file or text is far too large to be a seQRets Qard.');
    }

    const parts = shareString.split('|');

    if (parts[0] !== 'seQRets') {
        throw new Error('Invalid or corrupted share format.');
    }

    const base: Pick<ParsedShare, 'threshold' | 'total' | 'index' | 'version'> = {
        threshold: null,
        total: null,
        index: null,
        version: null,
    };

    // Legacy 3-segment, no hash (and no version — predates the marker).
    if (parts.length === 3) {
        return {
            coreString: shareString,
            salt: parts[1],
            data: parts[2],
            hash: null,
            hashValid: null,
            ...base,
        };
    }

    // 4+ segments: the sha256 segment can sit at index 3 (legacy v1.11.0)
    // or at the final index (current layout). Locate it anywhere from
    // index 3 onwards.
    const hashIdx = parts.findIndex((p, i) => i >= 3 && p.startsWith('sha256:'));
    if (hashIdx === -1) {
        throw new Error('Invalid or corrupted share format.');
    }

    const coreString = parts.slice(0, 3).join('|');
    const embeddedHash = parts[hashIdx].slice(7);
    // All non-hash segments past index 2, in their original order.
    const metaParts = [...parts.slice(3, hashIdx), ...parts.slice(hashIdx + 1)];

    // Hash covers seQRets|salt|data plus the meta segments in order.
    const hashInput = metaParts.length === 0
        ? coreString
        : `${coreString}|${metaParts.join('|')}`;
    const computedHash = computeShareHash(hashInput);

    const meta = { ...base };
    for (const segment of metaParts) {
        const eq = segment.indexOf('=');
        if (eq <= 0) continue;
        const key = segment.slice(0, eq);
        const value = segment.slice(eq + 1);
        // Recovery metadata values are small positive integers — the Shamir
        // library caps counts at 255. Anything else (t=0, t=-3, t=999, t=3junk)
        // is corruption; ignore the segment rather than feed nonsense to the
        // restore countdown. Note t=1/n=1/i=1 is legitimate (single-Qard sets).
        if (!/^\d{1,3}$/.test(value)) continue;
        const n = Number.parseInt(value, 10);
        if (n < 1 || n > 255) continue;
        if (key === 't') meta.threshold = n;
        else if (key === 'n') meta.total = n;
        else if (key === 'i') meta.index = n;
        else if (key === 'v') meta.version = n;
    }

    // A Qard from a future format generation must fail LOUDLY and clearly —
    // never silently misparse. This is the whole point of the version marker:
    // an executor decades from now can distinguish "the backup is damaged"
    // (hash mismatch) from "the software is too old" (this error).
    if (meta.version !== null && meta.version > SHARE_FORMAT_VERSION) {
        throw new Error('This Qard was created by a newer version of seQRets. Please update the app — or use the latest recover.html from github.com/seQRets/seQRets-Recover — and try again.');
    }

    // The app always writes t/n/i together and internally consistent (t ≤ n,
    // i ≤ n). A partial or contradictory trio can't be trusted, so drop all
    // three — the share still restores; only the "X of K added" countdown and
    // card-index display are lost.
    if (meta.threshold !== null || meta.total !== null || meta.index !== null) {
        if (
            meta.threshold === null || meta.total === null || meta.index === null ||
            meta.threshold > meta.total || meta.index > meta.total
        ) {
            meta.threshold = null;
            meta.total = null;
            meta.index = null;
        }
    }

    return {
        coreString,
        salt: parts[1],
        data: parts[2],
        hash: embeddedHash,
        hashValid: embeddedHash === computedHash,
        ...meta,
    };
}

export async function createShares(request: CreateSharesRequest): Promise<CreateSharesResult> {
    const { secret, password, totalShares, requiredShares, label, keyfile, embedRecoveryInfo } = request;

    if (totalShares === 1 && requiredShares !== 1) {
        throw new Error('If total shares is 1, required shares must also be 1.');
    }

    // Defense-in-depth: the UI prevents this, and the Shamir library would
    // reject it anyway (threshold must be ≥ 2) — but with its own jargon.
    if (requiredShares === 1 && totalShares > 1) {
        throw new Error('A set where only 1 Qard is required would let any single Qard restore the secret on its own. Require at least 2 Qards, or create just 1 Qard.');
    }

    const keyfileBytes = keyfile ? Buffer.from(keyfile, 'base64') : undefined;

    // --- Create main secret payload ---
    let payloadObject;
    const entropyResult = tryGetEntropy(secret);

    if (entropyResult) {
        // Store the concatenated entropy as a base64 string for better space efficiency
        const entropyBase64 = entropyResult.entropy.toString('base64');
        const mnemonicLengths = entropyResult.chunks.map(c => c.split(' ').length);
        payloadObject = { secret: entropyBase64, label: label || '', isMnemonic: true, mnemonicLengths };
        entropyResult.entropy.fill(0);
    } else {
        // If it's not a perfect mnemonic, treat it as a regular text secret.
        const cleanSecret = secret.trim();
        payloadObject = { secret: cleanSecret, label: label || '', isMnemonic: false };
    }

    const payloadString = JSON.stringify(payloadObject);
    const payloadBytes = textEncoder.encode(payloadString);

    let passwordDerivedKey: Uint8Array | undefined;
    let compressedPayload: Uint8Array | undefined;

    try {
        compressedPayload = gzip(payloadBytes, {
            level: 9,
            windowBits: 15,
            memLevel: 9,
        });

        if (compressedPayload.length > MAX_COMPRESSED_PAYLOAD) {
            throw new Error('This secret is too large. Please shorten it, or split it into separate smaller secrets.');
        }

        // Length privacy (v=1): zero-pad to PAYLOAD_PAD_BUCKET multiples so a
        // single Qard's size doesn't reveal the secret's size. See the bucket
        // constant's doc comment for why zeros and why after gzip.
        compressedPayload = padPayload(compressedPayload);

        const salt = randomBytes(SALT_LENGTH);
        passwordDerivedKey = await deriveKey(password, salt, keyfileBytes);

        const nonce = randomBytes(NONCE_LENGTH);
        const encryptedSecret = xchacha20poly1305(passwordDerivedKey, nonce).encrypt(compressedPayload);

        const combinedEncrypted = new Uint8Array(nonce.length + encryptedSecret.length);
        combinedEncrypted.set(nonce, 0);
        combinedEncrypted.set(encryptedSecret, nonce.length);

        // When totalShares === 1, skip Shamir splitting (the library requires ≥2)
        // and return the encrypted data directly as a single share.
        const encryptedShares = totalShares === 1
            ? [combinedEncrypted]
            : await split(combinedEncrypted, totalShares, requiredShares);

        const saltBase64 = Buffer.from(salt).toString('base64');
        const formattedShares = encryptedShares.map((shareData, idx) => {
            const shareDataBase64 = Buffer.from(shareData).toString('base64');
            // v= is always the FIRST metadata segment, hash-covered like the
            // rest. Old parsers ignore unknown key=value segments (and still
            // hash them correctly), so v=1 shares restore in older software.
            let core = `seQRets|${saltBase64}|${shareDataBase64}|v=${SHARE_FORMAT_VERSION}`;
            if (embedRecoveryInfo) {
                // 1-based index so it matches the visual "Qard #N" labelling.
                core += `|t=${requiredShares}|n=${totalShares}|i=${idx + 1}`;
            }
            return appendShareHash(core);
        });

        // Round-trip integrity verification
        for (const share of formattedShares) {
            const parsed = parseShare(share);
            if (parsed.hashValid !== true) {
                throw new Error('Internal integrity check failed: a generated share did not pass hash verification.');
            }
        }

        const setId = getSetIdForShare(salt);

        return {
            shares: formattedShares,
            totalShares,
            requiredShares,
            label,
            setId,
        };
    } finally {
        passwordDerivedKey?.fill(0);
        keyfileBytes?.fill(0);
        // Plaintext hygiene: wipe every buffer that held the unencrypted
        // payload. (The payloadString itself is a JS string and cannot be
        // wiped — an accepted platform limitation.)
        payloadBytes.fill(0);
        compressedPayload?.fill(0);
    }
}


export async function restoreSecret(request: RestoreSecretRequest): Promise<RestoreSecretResult> {
    const { shares, password, keyfile } = request;

    if (!shares || shares.length === 0) {
        throw new Error('No shares provided.');
    }

    let saltBase64: string | null = null;
    let requiredFromMeta: number | null = null;
    const encryptedShares: Uint8Array[] = [];

    for (const share of shares) {
        const parsed = parseShare(share);

        if (parsed.hashValid === false) {
            throw new Error('Share integrity check failed. The share data may be corrupted or tampered with.');
        }

        const currentSaltBase64 = parsed.salt;

        if (saltBase64 === null) {
            saltBase64 = currentSaltBase64;
        } else if (saltBase64 !== currentSaltBase64) {
            throw new Error('Inconsistent salts found across shares. Shares might be from different secrets.');
        }

        if (parsed.threshold !== null) {
            requiredFromMeta = Math.max(requiredFromMeta ?? 0, parsed.threshold);
        }

        const encryptedShareData = new Uint8Array(Buffer.from(parsed.data, 'base64'));
        encryptedShares.push(encryptedShareData);
    }

    if (saltBase64 === null) {
        throw new Error("Could not extract salt from shares.");
    }

    // When the Qards carry recovery metadata we know the real threshold — fail
    // fast with an actionable message instead of running Argon2id and surfacing
    // a misleading "check your password" after decryption inevitably fails.
    if (requiredFromMeta !== null && encryptedShares.length < requiredFromMeta) {
        throw new Error(`This secret needs ${requiredFromMeta} Qards to restore, but only ${encryptedShares.length} ${encryptedShares.length === 1 ? 'has' : 'have'} been added. Please add more Qards from this set.`);
    }

    // When there's only 1 share, it was stored without Shamir splitting,
    // so use it directly instead of calling combine().
    let combinedEncryptedSecret: Uint8Array;
    if (encryptedShares.length === 1) {
        combinedEncryptedSecret = encryptedShares[0];
    } else {
        try {
            combinedEncryptedSecret = await combine(encryptedShares);
        } catch (error) {
            throw new Error('Could not combine encrypted shares. Not enough shares provided, or shares are corrupted.');
        }
    }

    const salt = Buffer.from(saltBase64, 'base64');

    let passwordDerivedKey: Uint8Array | undefined;
    let keyfileBytesLocal: Uint8Array | undefined;
    let decryptedBytes: Uint8Array | undefined;
    let decompressedBytes: Uint8Array | undefined;

    try {
        keyfileBytesLocal = keyfile ? Buffer.from(keyfile, 'base64') : undefined;
        passwordDerivedKey = await deriveKey(password, salt, keyfileBytesLocal);

        const nonce = combinedEncryptedSecret.slice(0, NONCE_LENGTH);
        const encryptedData = combinedEncryptedSecret.slice(NONCE_LENGTH);

        try {
            decryptedBytes = xchacha20poly1305(passwordDerivedKey, nonce).decrypt(encryptedData);
        } catch (error) {
            // A lone share from a multi-Qard set decrypts to garbage and lands
            // here too, so with one share "wrong password" isn't the only
            // possible cause — say so.
            throw new Error(encryptedShares.length === 1
                ? 'Authentication failed. Please check your password, keyfile, and QR codes — or you may need more Qards from this set.'
                : 'Authentication failed. Please check your password, keyfile, and QR codes.');
        }

        // v=1 payloads carry trailing zero-padding after the gzip stream
        // (length privacy — see PAYLOAD_PAD_BUCKET). No explicit unpad step:
        // pako skips trailing NUL bytes after the stream ends (zlib's
        // tar-padding tolerance), which is also why pre-v1.14 apps and old
        // recover.html copies restore padded Qards unchanged. Guarded by the
        // padded-payload cases in the A/B verification script.
        decompressedBytes = ungzip(decryptedBytes);
        const decodedString = textDecoder.decode(decompressedBytes);

        try {
            const payload = JSON.parse(decodedString);
            let finalSecret = payload.secret;

            if (payload.isMnemonic && payload.mnemonicLengths && Array.isArray(payload.mnemonicLengths)) {
                const wordCountToBytes: { [key: number]: number } = {
                    12: 16, 15: 20, 18: 24, 21: 28, 24: 32
                };

                const combinedEntropy = Buffer.from(payload.secret, 'base64');
                const phrases: string[] = [];
                let currentIndex = 0;

                for (const wordCount of payload.mnemonicLengths) {
                    const bytes = wordCountToBytes[wordCount];
                    if (!bytes || currentIndex + bytes > combinedEntropy.length) {
                        throw new Error("Mnemonic length metadata is corrupted or does not match entropy data.");
                    }
                    const entropyChunk = combinedEntropy.slice(currentIndex, currentIndex + bytes);
                    phrases.push(entropyToMnemonic(entropyChunk, wordlist));
                    currentIndex += bytes;
                }

                if (currentIndex !== combinedEntropy.length) {
                    throw new Error("Entropy length does not match sum of mnemonic lengths. The data is likely corrupted.");
                }

                finalSecret = phrases.join('\n\n');
                combinedEntropy.fill(0); // slices above are views; this wipes them too
            }

            return {
                secret: finalSecret,
                label: payload.label || undefined,
            };
        } catch (e: any) {
            throw new Error(`Failed to parse the decrypted payload. The share data may be corrupted. Details: ${e.message}`);
        }
    } finally {
        passwordDerivedKey?.fill(0);
        keyfileBytesLocal?.fill(0);
        decryptedBytes?.fill(0);
        decompressedBytes?.fill(0);
    }
}


export async function decryptInstructions(request: DecryptInstructionRequest): Promise<DecryptInstructionResult> {
    const { encryptedData, password, keyfile } = request;

    let derivedKey: Uint8Array | undefined;
    let keyfileBytes: Uint8Array | undefined;
    let decryptedCompressedBytes: Uint8Array | undefined;
    let decryptedBytes: Uint8Array | undefined;

    try {
        const encryptedPayload = JSON.parse(encryptedData) as EncryptedInstruction;

        const salt = Buffer.from(encryptedPayload.salt, 'base64');
        keyfileBytes = keyfile ? Buffer.from(keyfile, 'base64') : undefined;

        derivedKey = await deriveKey(password, salt, keyfileBytes);

        const combinedBytes = Buffer.from(encryptedPayload.data, 'base64');
        const nonce = combinedBytes.slice(0, NONCE_LENGTH);
        const ciphertext = combinedBytes.slice(NONCE_LENGTH);

        decryptedCompressedBytes = xchacha20poly1305(derivedKey, nonce).decrypt(ciphertext);

        decryptedBytes = ungzip(decryptedCompressedBytes);
        const decryptedPayloadString = textDecoder.decode(decryptedBytes);
        const finalPayload = JSON.parse(decryptedPayloadString);

        return finalPayload as DecryptInstructionResult;

    } catch (e: any) {
        if (e.message.includes('Authentication failed')) {
            throw new Error('Authentication failed. Please check your password and keyfile.');
        }
        throw new Error('Failed to decrypt instructions. The file may be corrupted or the wrong credentials were used.');
    } finally {
        derivedKey?.fill(0);
        keyfileBytes?.fill(0);
        decryptedCompressedBytes?.fill(0);
        decryptedBytes?.fill(0);
    }
}


export async function encryptVault(jsonString: string, password: string): Promise<{ salt: string; data: string }> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await deriveKey(password, salt);

    try {
        const jsonBytes = textEncoder.encode(jsonString);
        const compressed = gzip(jsonBytes, { level: 9 });

        const nonce = randomBytes(NONCE_LENGTH);
        const ciphertext = xchacha20poly1305(derivedKey, nonce).encrypt(compressed);

        const combined = concatBytes(nonce, ciphertext);

        return {
            salt: Buffer.from(salt).toString('base64'),
            data: Buffer.from(combined).toString('base64'),
        };
    } finally {
        derivedKey.fill(0);
    }
}

export async function decryptVault(salt: string, data: string, password: string): Promise<string> {
    const saltBytes = Buffer.from(salt, 'base64');
    const derivedKey = await deriveKey(password, saltBytes);

    let decryptedCompressed: Uint8Array | undefined;
    let decompressed: Uint8Array | undefined;

    try {
        const combinedBytes = Buffer.from(data, 'base64');
        const nonce = combinedBytes.slice(0, NONCE_LENGTH);
        const ciphertext = combinedBytes.slice(NONCE_LENGTH);

        try {
            decryptedCompressed = xchacha20poly1305(derivedKey, nonce).decrypt(ciphertext);
        } catch (error) {
            throw new Error('Wrong vault password. Please try again.');
        }

        decompressed = ungzip(decryptedCompressed);
        return textDecoder.decode(decompressed);
    } finally {
        derivedKey.fill(0);
        decryptedCompressed?.fill(0);
        decompressed?.fill(0);
    }
}

// ── Desktop-native helpers ────────────────────────────────────────────────────
// These are called by desktop-crypto.ts, which performs the Argon2id + XChaCha20
// in Rust and only delegates the payload construction / parsing to these helpers.

/**
 * Builds the JSON payload string that will be compressed and encrypted by Rust.
 * Detects BIP-39 mnemonic phrases and stores them as compact entropy for efficiency.
 */
export function buildSharePayload(secret: string, label?: string): string {
    const entropyResult = tryGetEntropy(secret);
    let payloadObject;
    if (entropyResult) {
        const entropyBase64 = entropyResult.entropy.toString('base64');
        const mnemonicLengths = entropyResult.chunks.map(c => c.split(' ').length);
        payloadObject = { secret: entropyBase64, label: label || '', isMnemonic: true, mnemonicLengths };
        entropyResult.entropy.fill(0);
    } else {
        payloadObject = { secret: secret.trim(), label: label || '', isMnemonic: false };
    }
    return JSON.stringify(payloadObject);
}

/**
 * Parses the JSON payload returned by Rust after decryption, converting entropy
 * back to BIP-39 mnemonic phrases when applicable.
 */
export function parseSharePayload(jsonStr: string): { secret: string; label?: string } {
    const payload = JSON.parse(jsonStr);
    let finalSecret = payload.secret;

    if (payload.isMnemonic && payload.mnemonicLengths && Array.isArray(payload.mnemonicLengths)) {
        const wordCountToBytes: { [key: number]: number } = {
            12: 16, 15: 20, 18: 24, 21: 28, 24: 32,
        };
        const combinedEntropy = Buffer.from(payload.secret, 'base64');
        const phrases: string[] = [];
        let currentIndex = 0;

        for (const wordCount of payload.mnemonicLengths) {
            const bytes = wordCountToBytes[wordCount];
            if (!bytes || currentIndex + bytes > combinedEntropy.length) {
                throw new Error('Mnemonic length metadata is corrupted or does not match entropy data.');
            }
            const entropyChunk = combinedEntropy.slice(currentIndex, currentIndex + bytes);
            phrases.push(entropyToMnemonic(entropyChunk, wordlist));
            currentIndex += bytes;
        }

        if (currentIndex !== combinedEntropy.length) {
            throw new Error('Entropy length does not match sum of mnemonic lengths. The data is likely corrupted.');
        }
        finalSecret = phrases.join('\n\n');
        combinedEntropy.fill(0); // slices above are views; this wipes them too
    }

    return { secret: finalSecret, label: payload.label || undefined };
}

export async function encryptInstructions(instructions: RawInstruction, password: string, keyfile?: string): Promise<EncryptedInstruction> {
    const salt = randomBytes(SALT_LENGTH);

    const keyfileBytes = keyfile ? Buffer.from(keyfile, 'base64') : undefined;
    const passwordDerivedKey = await deriveKey(password, salt, keyfileBytes);

    try {
        const instructionsPayload = JSON.stringify(instructions);
        const instructionsBytes = textEncoder.encode(instructionsPayload);
        const compressedInstructions = gzip(instructionsBytes, { level: 9 });

        const instructionsNonce = randomBytes(NONCE_LENGTH);
        const encryptedData = xchacha20poly1305(passwordDerivedKey, instructionsNonce).encrypt(compressedInstructions);

        const combined = concatBytes(instructionsNonce, encryptedData);

        return {
            salt: Buffer.from(salt).toString('base64'),
            data: Buffer.from(combined).toString('base64'),
        };
    } finally {
        passwordDerivedKey.fill(0);
        keyfileBytes?.fill(0);
    }
}
