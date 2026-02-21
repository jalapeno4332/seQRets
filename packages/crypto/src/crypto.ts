
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { argon2id } from '@noble/hashes/argon2';
import { randomBytes, concatBytes } from '@noble/hashes/utils';
import { split, combine } from 'shamirs-secret-sharing-ts';
import { CreateSharesRequest, CreateSharesResult, RestoreSecretResult, RestoreSecretRequest, EncryptedInstruction, DecryptInstructionRequest, DecryptInstructionResult, RawInstruction } from './types';
import { Buffer } from 'buffer';
import { gzip, ungzip } from 'pako';
import { mnemonicToEntropy, entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const SALT_LENGTH = 16;
const ARGON2_MEM_COST = 65536; // 64MB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const KEY_LENGTH = 32;

const NONCE_LENGTH = 24;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Attempts to convert one or more concatenated BIP-39 phrases to a single entropy buffer.
// Returns an object with the combined entropy and the original chunks, or null if it fails.
export function tryGetEntropy(str: string): { entropy: Buffer; chunks: string[] } | null {
    const cleanStr = str.replace(/\n/g, ' ').trim();
    const words = cleanStr.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
        return null;
    }

    const chunks: string[] = [];
    let currentIndex = 0;
    while (currentIndex < words.length) {
        let foundChunk = false;
        // Check for 24, 21, 18, 15, and 12-word chunks in that order
        for (const count of [24, 21, 18, 15, 12]) {
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

    try {
        // Convert each valid mnemonic chunk to entropy and concatenate
        const entropies = chunks.map(chunk => mnemonicToEntropy(chunk, wordlist));
        return { entropy: Buffer.concat(entropies), chunks };
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


export async function createShares(request: CreateSharesRequest): Promise<CreateSharesResult> {
    const { secret, password, totalShares, requiredShares, label, keyfile } = request;

    if (totalShares === 1 && requiredShares !== 1) {
        throw new Error('If total shares is 1, required shares must also be 1.');
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
    } else {
        // If it's not a perfect mnemonic, treat it as a regular text secret.
        const cleanSecret = secret.trim();
        payloadObject = { secret: cleanSecret, label: label || '', isMnemonic: false };
    }

    const payloadString = JSON.stringify(payloadObject);
    const payloadBytes = textEncoder.encode(payloadString);

    const compressedPayload = gzip(payloadBytes, {
        level: 9,
        windowBits: 15,
        memLevel: 9,
    });

    const salt = randomBytes(SALT_LENGTH);
    const passwordDerivedKey = await deriveKey(password, salt, keyfileBytes);

    try {
        const nonce = randomBytes(NONCE_LENGTH);
        const encryptedSecret = xchacha20poly1305(passwordDerivedKey, nonce).encrypt(compressedPayload);

        const combinedEncrypted = new Uint8Array(nonce.length + encryptedSecret.length);
        combinedEncrypted.set(nonce, 0);
        combinedEncrypted.set(encryptedSecret, nonce.length);

        const encryptedBuffer = Buffer.from(combinedEncrypted);
        const encryptedShares = split(encryptedBuffer, { shares: totalShares, threshold: requiredShares });

        const saltBase64 = Buffer.from(salt).toString('base64');
        const formattedShares = encryptedShares.map(shareData => {
            const shareDataBase64 = shareData.toString('base64');
            return `seQRets|${saltBase64}|${shareDataBase64}`;
        });

        const setId = getSetIdForShare(salt);

        return {
            shares: formattedShares,
            totalShares,
            requiredShares,
            label,
            setId,
        };
    } finally {
        passwordDerivedKey.fill(0);
        keyfileBytes?.fill(0);
    }
}


export async function restoreSecret(request: RestoreSecretRequest): Promise<RestoreSecretResult> {
    const { shares, password, keyfile } = request;

    if (!shares || shares.length === 0) {
        throw new Error('No shares provided.');
    }

    let saltBase64: string | null = null;
    const encryptedShares: Buffer[] = [];

    for (const share of shares) {
        const parts = share.split('|');
        if (parts.length !== 3 || parts[0] !== 'seQRets') {
             throw new Error('Invalid or corrupted share format.');
        }

        const currentSaltBase64 = parts[1];

        if (saltBase64 === null) {
            saltBase64 = currentSaltBase64;
        } else if (saltBase64 !== currentSaltBase64) {
            throw new Error('Inconsistent salts found across shares. Shares might be from different secrets.');
        }

        const encryptedShareData = Buffer.from(parts[2], 'base64');
        encryptedShares.push(encryptedShareData);
    }

    if (saltBase64 === null) {
        throw new Error("Could not extract salt from shares.");
    }

    let combinedEncryptedSecret: Uint8Array;
    try {
        const combinedBuffer = combine(encryptedShares);
        combinedEncryptedSecret = new Uint8Array(combinedBuffer);
    } catch (error) {
        throw new Error('Could not combine encrypted shares. Not enough shares provided, or shares are corrupted.');
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
            throw new Error('Authentication failed. Please check your password, keyfile, and QR codes.');
        }

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
        console.error("Instruction decryption failed:", e);
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
