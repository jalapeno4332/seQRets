/**
 * desktop-crypto.ts — Native Rust crypto shim for seQRets Desktop
 *
 * Replaces the JavaScript Web Worker crypto path with direct Tauri IPC calls
 * to the Rust backend (Argon2id + XChaCha20-Poly1305 via `src-tauri/src/crypto.rs`).
 *
 * Shamir's Secret Sharing still runs in TypeScript (it operates on already-encrypted
 * ciphertext bytes and carries no key material), while all key derivation and
 * symmetric encryption/decryption happen natively in Rust.
 *
 * Wire format is bit-for-bit identical to the @noble/* JS implementation:
 *   Share string : seQRets|<salt_base64>|<share_data_base64>|v=1[|t=K|n=N|i=I]|sha256:<64_hex_chars>
 *   Encrypted blob : base64( nonce[24] || xchacha20_ciphertext_with_tag )
 *   Share payloads are zero-padded to 192-byte buckets before encryption
 *   (length privacy) — the padding is applied in Rust (crypto_create).
 */

import { invoke } from '@tauri-apps/api/core';
import { split, combine } from 'shamir-secret-sharing';
import { buildSharePayload, parseSharePayload, appendShareHash, parseShare, SHARE_FORMAT_VERSION } from '@seqrets/crypto';
// buffer-setup provides a Buffer polyfill for WKWebView (macOS) which does not
// expose globalThis.Buffer. We still need Buffer for base64 encoding/decoding.
import { Buffer } from './buffer-setup';
import type {
    CreateSharesRequest,
    CreateSharesResult,
    RestoreSecretRequest,
    RestoreSecretResult,
    DecryptInstructionRequest,
    DecryptInstructionResult,
    EncryptedInstruction,
    RawInstruction,
} from '@seqrets/crypto';

// Shape of the { salt, data } object returned by crypto_create / crypto_encrypt_blob.
interface NativeCryptoResult {
    salt: string; // base64-encoded 16-byte salt
    data: string; // base64-encoded (nonce[24] || ciphertext)
}

// ── Share creation ────────────────────────────────────────────────────────────

/**
 * Encrypts and splits a secret into Shamir shares using the native Rust backend.
 *
 * Flow:
 *   1. Build JSON payload (with BIP-39 entropy compaction if applicable)
 *   2. Rust: gzip → Argon2id key derivation → XChaCha20 encrypt → return (salt, nonce||ciphertext)
 *   3. TypeScript: Shamir split the raw (nonce||ciphertext) bytes
 *   4. Format each share as `seQRets|<salt>|<shareData_base64>|v=1[|t|n|i]|sha256:H`
 */
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

    // Step 1: Build the JSON payload string (BIP-39 detection happens here).
    const jsonPayload = buildSharePayload(secret, label);

    // Step 2: Rust handles gzip + key derivation + XChaCha20 encryption.
    const { salt, data } = await invoke<NativeCryptoResult>('crypto_create', {
        jsonPayload,
        password,
        keyfileB64: keyfile ?? null,
    });

    // Step 3: Shamir-split the raw (nonce||ciphertext) bytes.
    // When totalShares === 1, skip Shamir splitting (the library requires ≥2)
    // and return the encrypted data directly as a single share.
    const encryptedBytes = new Uint8Array(Buffer.from(data, 'base64'));

    // Keep generated shares comfortably below parseShare's size ceiling so a
    // Qard we create today can always be read back tomorrow (matches the
    // MAX_COMPRESSED_PAYLOAD guard in @seqrets/crypto createShares).
    if (encryptedBytes.length > 150_000) {
        throw new Error('This secret is too large. Please shorten it, or split it into separate smaller secrets.');
    }

    const encryptedShares = totalShares === 1
        ? [encryptedBytes]
        : await split(encryptedBytes, totalShares, requiredShares);

    // Step 4: Format shares with SHA-256 integrity hash.
    const formattedShares = encryptedShares.map((shareData, idx) => {
        // v= is always the FIRST metadata segment, hash-covered like the
        // rest — must stay in lockstep with createShares in @seqrets/crypto.
        // (The Rust side already zero-padded the payload for v=1.)
        let core = `seQRets|${salt}|${Buffer.from(shareData).toString('base64')}|v=${SHARE_FORMAT_VERSION}`;
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

    // The setId is the first 8 characters of the base64 salt (matches JS implementation).
    const setId = salt.substring(0, 8);

    return {
        shares: formattedShares,
        totalShares,
        requiredShares,
        label,
        setId,
    };
}

// ── Secret restoration ────────────────────────────────────────────────────────

/**
 * Combines Shamir shares and decrypts the secret using the native Rust backend.
 *
 * Flow:
 *   1. Validate share format and ensure consistent salt across all shares
 *   2. TypeScript: Shamir combine the share bytes
 *   3. Rust: Argon2id key derivation → XChaCha20 decrypt → gzip decompress → return JSON
 *   4. Parse JSON payload (BIP-39 entropy reconstruction if applicable)
 */
export async function restoreSecret(request: RestoreSecretRequest): Promise<RestoreSecretResult> {
    const { shares, password, keyfile } = request;

    if (!shares || shares.length === 0) {
        throw new Error('No shares provided.');
    }

    // Step 1: Validate and parse share strings.
    let saltBase64: string | null = null;
    let requiredFromMeta: number | null = null;
    const shareBuffers: Uint8Array[] = [];

    for (const share of shares) {
        const parsed = parseShare(share);

        if (parsed.hashValid === false) {
            throw new Error('Share integrity check failed. The share data may be corrupted or tampered with.');
        }

        const currentSalt = parsed.salt;
        if (saltBase64 === null) {
            saltBase64 = currentSalt;
        } else if (saltBase64 !== currentSalt) {
            throw new Error('Inconsistent salts found across shares. Shares might be from different secrets.');
        }

        if (parsed.threshold !== null) {
            requiredFromMeta = Math.max(requiredFromMeta ?? 0, parsed.threshold);
        }

        shareBuffers.push(new Uint8Array(Buffer.from(parsed.data, 'base64')));
    }

    if (!saltBase64) {
        throw new Error('Could not extract salt from shares.');
    }

    // When the Qards carry recovery metadata we know the real threshold — fail
    // fast with an actionable message instead of running Argon2id and surfacing
    // a misleading "check your password" after decryption inevitably fails.
    if (requiredFromMeta !== null && shareBuffers.length < requiredFromMeta) {
        throw new Error(`This secret needs ${requiredFromMeta} Qards to restore, but only ${shareBuffers.length} ${shareBuffers.length === 1 ? 'has' : 'have'} been added. Please add more Qards from this set.`);
    }

    // Step 2: Shamir combine — reconstructs the raw (nonce||ciphertext) bytes.
    // When there's only 1 share, it was stored without Shamir splitting,
    // so use it directly instead of calling combine().
    let combinedBytes: Uint8Array;
    if (shareBuffers.length === 1) {
        combinedBytes = shareBuffers[0];
    } else {
        try {
            combinedBytes = await combine(shareBuffers);
        } catch {
            throw new Error(
                'Could not combine encrypted shares. Not enough shares provided, or shares are corrupted.'
            );
        }
    }

    // Step 3: Rust decrypts and decompresses, returning the JSON payload string.
    let jsonPayload: string;
    try {
        jsonPayload = await invoke<string>('crypto_restore', {
            saltB64: saltBase64,
            encryptedB64: Buffer.from(combinedBytes).toString('base64'),
            password,
            keyfileB64: keyfile ?? null,
        });
    } catch (e: any) {
        // Surface Rust error (wrong password / keyfile / corrupted) cleanly.
        // A lone share from a multi-Qard set decrypts to garbage and lands here
        // too, so with one share "wrong password" isn't the only possible
        // cause — say so.
        const message = e?.message ?? 'Authentication failed. Please check your password, keyfile, and QR codes.';
        throw new Error(shareBuffers.length === 1
            ? `${message} If this secret was split into multiple Qards, you may also need more Qards from this set.`
            : message);
    }

    // Step 4: Parse payload (reconstructs BIP-39 phrases if applicable).
    try {
        return parseSharePayload(jsonPayload);
    } catch (e: any) {
        throw new Error(`Failed to parse the decrypted payload. The data may be corrupted. Details: ${e.message}`);
    }
}

// ── Vault encryption / decryption ─────────────────────────────────────────────

export async function encryptVault(
    jsonString: string,
    password: string
): Promise<{ salt: string; data: string }> {
    const result = await invoke<NativeCryptoResult>('crypto_encrypt_blob', {
        json: jsonString,
        password,
        keyfileB64: null,
    });
    return { salt: result.salt, data: result.data };
}

export async function decryptVault(
    salt: string,
    data: string,
    password: string
): Promise<string> {
    return invoke<string>('crypto_decrypt_blob', {
        saltB64: salt,
        dataB64: data,
        password,
        keyfileB64: null,
    });
}

// ── Instructions encryption / decryption ──────────────────────────────────────

export async function encryptInstructions(
    instructions: RawInstruction,
    password: string,
    keyfile?: string
): Promise<EncryptedInstruction> {
    const json = JSON.stringify(instructions);
    const result = await invoke<NativeCryptoResult>('crypto_encrypt_blob', {
        json,
        password,
        keyfileB64: keyfile ?? null,
    });
    return { salt: result.salt, data: result.data };
}

export async function decryptInstructions(
    request: DecryptInstructionRequest
): Promise<DecryptInstructionResult> {
    const { encryptedData, password, keyfile } = request;
    const parsed = JSON.parse(encryptedData) as EncryptedInstruction;

    const jsonResult = await invoke<string>('crypto_decrypt_blob', {
        saltB64: parsed.salt,
        dataB64: parsed.data,
        password,
        keyfileB64: keyfile ?? null,
    });

    return JSON.parse(jsonResult) as DecryptInstructionResult;
}
