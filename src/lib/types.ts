// Re-export all crypto types from shared package
export type { EncryptedInstruction, RawInstruction, QrCodeData, CreateSharesRequest, CreateSharesResult, RestoreSecretRequest, RestoreSecretResult, DecryptInstructionRequest, DecryptInstructionResult, ExportedVault, EncryptedVaultFile } from '@seqrets/crypto';

// App-specific types (stay here)
export type AskBobInput = {
  history: { role: 'user' | 'model'; content: string }[];
  question: string;
};

export type AskBobOutput = string;
