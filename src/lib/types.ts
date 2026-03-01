// Re-export all crypto types from shared package
export type { RawInstruction, QrCodeData, CreateSharesRequest, CreateSharesResult, RestoreSecretRequest, DecryptInstructionRequest, EncryptedVaultFile } from '@seqrets/crypto';

// App-specific types (stay here)
export type AskBobInput = {
  history: { role: 'user' | 'model'; content: string }[];
  question: string;
};

export type AskBobOutput = string;
