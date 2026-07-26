
export interface EncryptedInstruction {
    salt: string; // base64
    data: string; // base64 of (nonce + encrypted gzipped data)
}

export interface RawInstruction {
    fileName: string;
    fileContent: string; // base64
    fileType: string;
}

export interface QrCodeData {
    shares: string[];
    totalShares: number;
    requiredShares: number;
    label?: string;
    setId: string;
    isTextOnly?: boolean;
}

export interface CreateSharesRequest {
    secret: string;
    password: string;
    totalShares: number;
    requiredShares: number;
    label?: string;
    keyfile?: string; // Base64 encoded keyfile content
    /**
     * If true, embed threshold/total/index metadata in each share string.
     * Enables a "X more Qards required" countdown during restoration. The
     * metadata is covered by the SHA-256 hash, which detects accidental
     * corruption or damage — but NOT deliberate tampering: the hash is
     * unkeyed and travels with the Qard, so anyone who edits a Qard can
     * recompute a matching hash. The metadata is also visible to anyone who
     * scans the QR. Off by default.
     */
    embedRecoveryInfo?: boolean;
}

export interface CreateSharesResult extends QrCodeData {
    encryptedInstructions?: EncryptedInstruction;
}

export interface RestoreSecretRequest {
    shares: string[];
    password: string;
    keyfile?: string; // Base64 encoded keyfile content
}

export interface RestoreSecretResult {
    secret: string;
    label?: string;
}

export interface DecryptInstructionRequest {
    encryptedData: string; // The full JSON string of the EncryptedInstruction object
    password: string;
    keyfile?: string; // Base64 encoded keyfile content
}

export type DecryptInstructionResult = RawInstruction;

// Represents an encrypted vault file (.seqrets) protected with an additional vault password
export interface EncryptedVaultFile {
    version: 2;
    encrypted: true;
    salt: string;   // base64
    data: string;   // base64(nonce + ciphertext of gzipped JSON)
}

export interface ParsedShare {
    coreString: string;        // 3-part string without hash segment
    salt: string;              // base64 salt
    data: string;              // base64 share data
    hash: string | null;       // full 64-char hex, or null if legacy
    hashValid: boolean | null; // true = match, false = mismatch, null = legacy (no hash)
    /**
     * Share-format version from the `v=` segment. null = legacy share
     * (created before the version marker existed; payload is unpadded).
     * 1 = current (payload zero-padded to PAYLOAD_PAD_BUCKET multiples).
     * parseShare throws on versions above the current one rather than
     * returning them — a frozen Qard from a newer app must produce a
     * clear "update your software" error, never a silent misparse.
     */
    version: number | null;
    // Optional recovery metadata. Present only when the share was
    // generated with `embedRecoveryInfo: true`. All three are tied to
    // the same set and are covered by the SHA-256 hash.
    threshold: number | null;  // K — minimum shares required to restore
    total: number | null;      // N — total shares created in the set
    index: number | null;      // I — 1-based position of this share in the set
}
