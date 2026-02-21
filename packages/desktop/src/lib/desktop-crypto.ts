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
 *   Share string : seQRets|<salt_base64>|<share_data_base64>
 *   Encrypted blob : base64( nonce[24] || xchacha20_ciphertext_with_tag )
 */

import { invoke } from '@tauri-apps/api/core';
import { split, combine } from 'shamirs-secret-sharing-ts';
import { buildSharePayload, parseSharePayload } from '@seqrets/crypto';
import { Buffer } from 'buffer';
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
 *   4. Format each share as `seQRets|<salt>|<shareData_base64>`
 */
export async function createShares(request: CreateSharesRequest): Promise<CreateSharesResult> {
    const { secret, password, totalShares, requiredShares, label, keyfile } = request;

    if (totalShares === 1 && requiredShares !== 1) {
        throw new Error('If total shares is 1, required shares must also be 1.');
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
    const encryptedBytes = Buffer.from(data, 'base64');
    const encryptedShares = split(encryptedBytes, { shares: totalShares, threshold: requiredShares });

    // Step 4: Format shares. The salt is already base64 (returned from Rust).
    const formattedShares = encryptedShares.map(
        shareData => `seQRets|${salt}|${Buffer.from(shareData).toString('base64')}`
    );

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
    const shareBuffers: Buffer[] = [];

    for (const share of shares) {
        const parts = share.split('|');
        if (parts.length !== 3 || parts[0] !== 'seQRets') {
            throw new Error('Invalid or corrupted share format.');
        }
        const currentSalt = parts[1];
        if (saltBase64 === null) {
            saltBase64 = currentSalt;
        } else if (saltBase64 !== currentSalt) {
            throw new Error('Inconsistent salts found across shares. Shares might be from different secrets.');
        }
        shareBuffers.push(Buffer.from(parts[2], 'base64'));
    }

    if (!saltBase64) {
        throw new Error('Could not extract salt from shares.');
    }

    // Step 2: Shamir combine — reconstructs the raw (nonce||ciphertext) bytes.
    let combinedBuffer: Buffer;
    try {
        combinedBuffer = Buffer.from(combine(shareBuffers));
    } catch {
        throw new Error(
            'Could not combine encrypted shares. Not enough shares provided, or shares are corrupted.'
        );
    }

    // Step 3: Rust decrypts and decompresses, returning the JSON payload string.
    let jsonPayload: string;
    try {
        jsonPayload = await invoke<string>('crypto_restore', {
            saltB64: saltBase64,
            encryptedB64: combinedBuffer.toString('base64'),
            password,
            keyfileB64: keyfile ?? null,
        });
    } catch (e: any) {
        // Surface Rust error (wrong password / keyfile / corrupted) cleanly.
        throw new Error(e?.message ?? 'Authentication failed. Please check your password, keyfile, and QR codes.');
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
