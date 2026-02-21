/// Native Rust cryptographic backend for seQRets desktop.
///
/// Provides Argon2id key derivation and XChaCha20-Poly1305 authenticated
/// encryption/decryption with gzip compression, called from the TypeScript
/// frontend via Tauri IPC. All sensitive intermediate values are zeroed via
/// the `zeroize` crate when dropped.
///
/// Wire format (identical to the @noble/* JS implementation):
///   - Key derivation : Argon2id(m=65536, t=3, p=1, len=32) over (password ++ optional_keyfile)
///   - Encryption     : XChaCha20-Poly1305 with a random 24-byte nonce
///   - Payload format : base64( nonce[24] || xchacha20_ciphertext_with_tag )
///   - Salt           : 16 random bytes, stored as base64 alongside the ciphertext
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::{
    aead::Aead,
    {KeyInit, XChaCha20Poly1305, XNonce},
};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use rand::RngCore;
use serde::Serialize;
use std::io::{Read, Write};
use zeroize::{Zeroize, Zeroizing};

const SALT_LENGTH: usize = 16;
const NONCE_LENGTH: usize = 24;
const KEY_LENGTH: usize = 32;

// Argon2id parameters — must match the @noble/hashes JS implementation exactly.
const ARGON2_M_COST: u32 = 65536; // 64 MiB
const ARGON2_T_COST: u32 = 3; // iterations
const ARGON2_P_COST: u32 = 1; // parallelism

/// Returned by crypto_create and crypto_encrypt_blob.
#[derive(Serialize)]
pub struct CryptoResult {
    pub salt: String, // base64-encoded 16-byte random salt
    pub data: String, // base64-encoded (nonce[24] || xchacha20_ciphertext)
}

// ── Private helpers ──────────────────────────────────────────────────────────

/// Derives a 32-byte key from a password and optional base64-encoded keyfile
/// using Argon2id. The input buffer is zeroized when it drops.
fn derive_key(
    password: &str,
    salt: &[u8],
    keyfile_b64: Option<&str>,
) -> Result<Zeroizing<[u8; KEY_LENGTH]>, String> {
    // Build the KDF input: password_bytes || optional_keyfile_bytes
    let input: Zeroizing<Vec<u8>> = if let Some(kf_b64) = keyfile_b64 {
        let kf_bytes = STANDARD
            .decode(kf_b64)
            .map_err(|e| format!("Keyfile base64 decode error: {e}"))?;
        let mut combined = Vec::with_capacity(password.len() + kf_bytes.len());
        combined.extend_from_slice(password.as_bytes());
        combined.extend_from_slice(&kf_bytes);
        Zeroizing::new(combined)
    } else {
        Zeroizing::new(password.as_bytes().to_vec())
    };

    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(KEY_LENGTH))
        .map_err(|e| format!("Argon2 params error: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = Zeroizing::new([0u8; KEY_LENGTH]);
    argon2
        .hash_password_into(input.as_slice(), salt, key.as_mut_slice())
        .map_err(|e| format!("Argon2 hash error: {e}"))?;

    // `input` is Zeroizing<Vec<u8>> — automatically zeroized on drop here.
    Ok(key)
}

fn gzip_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder
        .write_all(data)
        .map_err(|e| format!("Gzip write error: {e}"))?;
    encoder
        .finish()
        .map_err(|e| format!("Gzip finish error: {e}"))
}

fn gzip_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| format!("Gzip decompress error: {e}"))?;
    Ok(out)
}

/// Encrypts `plaintext` with XChaCha20-Poly1305 using `key`.
/// Returns `base64(random_nonce[24] || ciphertext_with_tag)`.
fn encrypt(plaintext: &[u8], key: &[u8; KEY_LENGTH]) -> Result<String, String> {
    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Cipher init error (invalid key length)".to_string())?;
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "Encryption error".to_string())?;

    let mut combined = Vec::with_capacity(NONCE_LENGTH + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(STANDARD.encode(combined))
}

/// Decrypts `data_b64` (base64 of nonce[24] || ciphertext) with XChaCha20-Poly1305.
/// Returns the plaintext bytes. Sensitive intermediate bytes are zeroized on drop.
fn decrypt(data_b64: &str, key: &[u8; KEY_LENGTH]) -> Result<Zeroizing<Vec<u8>>, String> {
    let combined = STANDARD
        .decode(data_b64)
        .map_err(|e| format!("Base64 decode error: {e}"))?;

    if combined.len() < NONCE_LENGTH {
        return Err("Encrypted data is too short to contain a nonce".to_string());
    }

    let nonce_bytes = &combined[..NONCE_LENGTH];
    let ciphertext = &combined[NONCE_LENGTH..];

    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Cipher init error (invalid key length)".to_string())?;
    let nonce = XNonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong password, keyfile, or corrupted data".to_string())?;

    Ok(Zeroizing::new(plaintext))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Gzip-compresses `json_payload`, derives a key with Argon2id, then encrypts
/// with XChaCha20-Poly1305. Returns a random base64 salt and the encrypted blob.
///
/// Used by `createShares` in desktop-crypto.ts: the caller performs the Shamir
/// split on the decoded `data` bytes in JavaScript.
#[tauri::command]
pub fn crypto_create(
    json_payload: String,
    password: String,
    keyfile_b64: Option<String>,
) -> Result<CryptoResult, String> {
    let compressed = gzip_compress(json_payload.as_bytes())?;

    let mut salt = [0u8; SALT_LENGTH];
    rand::thread_rng().fill_bytes(&mut salt);

    let key = derive_key(&password, &salt, keyfile_b64.as_deref())?;
    let data = encrypt(&compressed, &key)?;

    Ok(CryptoResult {
        salt: STANDARD.encode(salt),
        data,
    })
}

/// Derives a key with Argon2id, decrypts `encrypted_b64` (base64 of the
/// Shamir-combined nonce||ciphertext), then gzip-decompresses. Returns the
/// JSON payload string.
///
/// Used by `restoreSecret` in desktop-crypto.ts: the caller performs the
/// Shamir combine in JavaScript before calling this command.
#[tauri::command]
pub fn crypto_restore(
    salt_b64: String,
    encrypted_b64: String,
    password: String,
    keyfile_b64: Option<String>,
) -> Result<String, String> {
    let salt = STANDARD
        .decode(&salt_b64)
        .map_err(|e| format!("Salt base64 decode error: {e}"))?;

    let key = derive_key(&password, &salt, keyfile_b64.as_deref())?;
    let mut plaintext = decrypt(&encrypted_b64, &key)?;

    let decompressed = gzip_decompress(&plaintext)?;
    plaintext.zeroize(); // zero the compressed-but-decrypted bytes

    String::from_utf8(decompressed).map_err(|e| format!("UTF-8 decode error: {e}"))
}

/// Gzip-compresses and encrypts a JSON string for vault/instructions storage.
/// Returns a base64 salt and encrypted blob (nonce||ciphertext).
///
/// Used by `encryptVault` and `encryptInstructions` in desktop-crypto.ts.
#[tauri::command]
pub fn crypto_encrypt_blob(
    json: String,
    password: String,
    keyfile_b64: Option<String>,
) -> Result<CryptoResult, String> {
    let compressed = gzip_compress(json.as_bytes())?;

    let mut salt = [0u8; SALT_LENGTH];
    rand::thread_rng().fill_bytes(&mut salt);

    let key = derive_key(&password, &salt, keyfile_b64.as_deref())?;
    let data = encrypt(&compressed, &key)?;

    Ok(CryptoResult {
        salt: STANDARD.encode(salt),
        data,
    })
}

/// Derives a key with Argon2id, decrypts `data_b64` (base64 of nonce||ciphertext),
/// then gzip-decompresses. Returns the JSON string.
///
/// Used by `decryptVault` and `decryptInstructions` in desktop-crypto.ts.
#[tauri::command]
pub fn crypto_decrypt_blob(
    salt_b64: String,
    data_b64: String,
    password: String,
    keyfile_b64: Option<String>,
) -> Result<String, String> {
    let salt = STANDARD
        .decode(&salt_b64)
        .map_err(|e| format!("Salt base64 decode error: {e}"))?;

    let key = derive_key(&password, &salt, keyfile_b64.as_deref())?;
    let mut plaintext = decrypt(&data_b64, &key)?;

    let decompressed = gzip_decompress(&plaintext)?;
    plaintext.zeroize();

    String::from_utf8(decompressed).map_err(|e| format!("UTF-8 decode error: {e}"))
}
