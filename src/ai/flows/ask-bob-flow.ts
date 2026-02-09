
'use server';

import { ai } from '@/ai/genkit';
import { AskBobInput, AskBobInputSchema, AskBobOutput } from '@/lib/types';
import { z } from 'zod';

const readmeContent = `
# seQRets: Crypto Inheritance That Actually Works

seQRets is a hyper-secure, open-source application designed to protect your most sensitive digital information—from crypto seed phrases and private keys to passwords and other confidential data. It uses a powerful cryptographic technique called Shamir's Secret Sharing to split your secret into multiple QR codes, which we call "Qards."

To restore your original secret, you must bring a specific number of these Qards back together. This method eliminates the single point of failure associated with storing secrets in one location, providing a robust solution for personal backup and inheritance planning.

## Core Features

- **Shamir's Secret Sharing:** Split any text-based secret into a configurable number of Qards. You decide how many are needed for recovery.
- **Strong Encryption:** Your secret is encrypted on the client-side using **XChaCha20-Poly1305**. The encryption key is derived from your password and an optional keyfile using **Argon2id**, a memory-hard key derivation function.
- **Client-Side Security:** All cryptographic operations happen in your browser. Your raw secret and password are never sent to any server. This is a core principle of our zero-knowledge architecture.
- **Password Generator:** A built-in tool to generate a high-entropy, 32-character password that meets the app's security requirements.
- **Seed Phrase Generator:** A tool to generate a new 12 or 24-word BIP-39 mnemonic seed phrase.
- **Optional Keyfile:** For enhanced security, you can use any file as an additional "key." Both the password AND the keyfile are required for recovery.
- **Export Vault File:** Export your encrypted Qards as a local .seqrets file for safekeeping in iCloud, Google Drive, or a USB drive.
- **Import Vault File:** Import a previously exported .seqrets file to restore your Qards into the app.
- **Flexible Backup Options:** Download your Qards as printable QR code images (PNG), as raw text files (TXT), or both.
- **Secure Memory Wipe:** To protect against advanced threats, seQRets automatically overwrites sensitive data (like your secret and password) in the browser's memory with random data immediately after it has been used.

## How to Use seQRets

The app guides you through a simple, step-by-step process.

### Encrypting a Secret (The "Secure Secret" Tab)
1.  **Step 1: Enter Your Secret.** Enter the secret you want to protect (e.g., a 12/24 word seed phrase). You can also use the **Seed Phrase Generator** to create a new one. Once done, click **Next Step**.
2.  **Step 2: Secure Your Secret.** Generate or enter a strong password. For maximum security, you can add a **Keyfile**. When your credentials are set, click **Next Step**.
3.  **Step 3: Split into Qards.** Choose the total number of Qards to create and how many are required for restoration. When you're ready, click the final button to **Encrypt & Generate** your Qards. You can then download them or export them as a vault file.

### Decrypting a Secret (The "Restore Secret" Tab)
1.  **Step 1: Add Your Qards.** Add the required number of shares using one of these methods:
    *   **Upload Images:** Drag and drop the Qard images.
    *   **Scan with Camera:** Scan the Qards one by one.
    *   **Manual Entry:** Paste the raw text of each share.
    *   **Import Vault File:** Load shares from a previously exported .seqrets file.
    Once you've added enough shares, click **Next Step**.
2. **Step 2: Provide Your Credentials.** Enter the password that was used to encrypt the Qards. If a keyfile was used, upload the original file. When ready, click **Next Step**.
3. **Step 3: Restore Your Secret.** Click the final **Restore Secret** button to reveal the original data.
`;

const cryptoDetails = `
## DEEPER TECHNICAL DETAILS ##

*   **Key Derivation Function (KDF):**
    *   **Algorithm:** Argon2id
    *   **Iterations (Time Cost):** 3
    *   **Memory Cost:** 65536 (64 MB)
    *   **Parallelism:** 1
    *   **Salt Length:** 16 bytes (cryptographically random)
    *   **Derived Key Length:** 32 bytes (256 bits)

*   **Encryption Algorithm:**
    *   **Algorithm:** XChaCha20-Poly1305 (AEAD cipher)
    *   **Nonce Length:** 24 bytes (192 bits, cryptographically random)

*   **Secret Splitting:**
    *   **Algorithm:** Shamir's Secret Sharing
    *   The splitting happens *after* encryption. The raw, unencrypted secret is never split directly.

*   **Seed Phrase Generator & Validation:**
    *   **Library:** @scure/bip39
    *   Generates 12-word (128-bit) or 24-word (256-bit) mnemonic phrases based on the BIP-39 standard.
`;

function createBobPromptAndFlow() {
  if (!ai) return null;

  const bobPrompt = ai.definePrompt(
    {
      name: 'bobPrompt',
      input: { schema: AskBobInputSchema },
      model: 'googleai/gemini-2.5-flash',
      system: `You are Bob, a friendly and expert AI assistant for the seQRets application.
Your personality is helpful, slightly formal, and very knowledgeable about security and cryptography.
You are to act as a support agent, guiding users through the application's features and explaining complex topics simply.

You MUST use the provided context from the seQRets documentation as your primary source of truth for questions about the seQRets app itself. Avoid terms like "end-to-end encryption" and instead prefer "client-side encryption" and "zero-knowledge architecture" when explaining how the app works.

## RESPONSE GUIDELINES ##

1.  **On Cryptocurrency:** Be precise. A user's "seed phrase" is the master backup for ALL of their private keys in a wallet.

2.  **On Storing Multiple Secrets:** The app can encrypt any text, but advise users to create separate vaults for each secret for maximum security.

3.  **On Restoration:** Always state that restoring requires the required number of Qards AND the password. If a keyfile was used, mention that too.

4.  **On Inheritance Planning:** Guide users on structuring their plan. The key is to eliminate single points of failure. Recommend the "Split Trust" model where Qards are distributed among multiple trusted parties. The password should NEVER be stored with the Qards.

## CONTEXT: seQRets Documentation ##
${readmeContent}

${cryptoDetails}`,
      prompt: `A user is asking a question. Here is the chat history with the user, followed by their latest question.

  {{#if history}}
  ## CHAT HISTORY ##
  {{#each history}}
  **{{role}}**:
  {{content}}

  ---
  {{/each}}
  {{/if}}

  ## USER'S QUESTION ##
  {{question}}`,
    },
  );

  const askBobFlow = ai.defineFlow(
    {
      name: 'askBobFlow',
      inputSchema: AskBobInputSchema,
      outputSchema: z.string(),
    },
    async (input) => {
      try {
        const response = await bobPrompt(input);
        return response.text || "I'm sorry, I'm having trouble thinking right now. Please try asking again.";
      } catch (e: any) {
        console.error('Error in askBobFlow:', e);
        if (e.message && e.message.includes('503')) {
          return "I apologize, but my connection to the AI service is temporarily unavailable. Please try again in a few moments.";
        }
        return "I'm sorry, I'm having trouble thinking right now. Please try asking your question again.";
      }
    }
  );

  return askBobFlow;
}

const askBobFlow = createBobPromptAndFlow();

export async function askBob(input: AskBobInput): Promise<AskBobOutput> {
  if (!askBobFlow) {
    return "I'm not available right now. To enable Bob, please set a GOOGLE_API_KEY or GEMINI_API_KEY environment variable and restart the application.";
  }
  return askBobFlow(input);
}
