
import { z } from 'zod';

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


// Represents the structure of a locally exported vault file (.seqrets)
export interface ExportedVault {
    version: number;
    label: string;
    setId: string;
    shares: string[];
    requiredShares: number;
    totalShares: number;
    createdAt: string;
    encryptedInstructions?: EncryptedInstruction | null;
    keyfileUsed: boolean;
}


// Represents an encrypted vault file (.seqrets) protected with an additional vault password
export interface EncryptedVaultFile {
    version: 2;
    encrypted: true;
    salt: string;   // base64
    data: string;   // base64(nonce + ciphertext of gzipped JSON)
}

// Types for the AskBob AI Flow
export const AskBobInputSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })),
  question: z.string(),
});
export type AskBobInput = z.infer<typeof AskBobInputSchema>;

export const AskBobOutputSchema = z.string();
export type AskBobOutput = z.infer<typeof AskBobOutputSchema>;
