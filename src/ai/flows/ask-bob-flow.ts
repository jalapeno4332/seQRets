
'use client';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AskBobInput, AskBobOutput } from '@/lib/types';

const readmeContent = `
# seQRets: Secure. Split. Share.

seQRets is a hyper-secure, open-source application designed to protect your most sensitive digital information — from crypto seed phrases and private keys to passwords and other confidential data. It uses a powerful cryptographic technique called Shamir's Secret Sharing to split your secret into multiple QR codes, which we call "Qards."

To restore your original secret, you must bring a specific number of these Qards back together. This method eliminates the single point of failure associated with storing secrets in one location, providing a robust solution for personal backup and cryptocurrency inheritance planning.

Version 0.9.0 "Pyre" — Available as a web app (Next.js) and native desktop app (Tauri).

## Core Features

### Secure Your Secret
- **Shamir's Secret Sharing:** Split any text-based secret into a configurable number of Qards. You decide how many are needed for recovery (e.g., 2-of-3, 3-of-5 threshold).
- **Strong Encryption:** Your secret is compressed (gzip level 9), then encrypted on the client-side using **XChaCha20-Poly1305** (AEAD). The encryption key is derived from your password and an optional keyfile using **Argon2id**, a memory-hard key derivation function.
- **Client-Side Security:** All cryptographic operations happen on your device. Your raw secret and password are never sent to any server. This is a core principle of our zero-knowledge architecture.
- **Password Generator:** A built-in tool to generate a high-entropy, 32-character password. Passwords must be at least 24 characters and include uppercase, lowercase, numbers, and special characters. The password field shows green when valid, red when not.
- **Seed Phrase Generator:** A tool to generate a new 12 or 24-word BIP-39 mnemonic seed phrase.
- **BIP-39 Optimization:** Seed phrases are automatically detected and converted to compact binary entropy before encryption. A 24-word phrase (~150 characters) becomes just 32 bytes, dramatically reducing QR code size.
- **Optional Keyfile:** For enhanced security, you can use any file as an additional "key." Both the password AND the keyfile are required for recovery. Users can generate a keyfile and either download it or save it to a smart card. Keyfiles can also be loaded from a smart card anywhere keyfiles are accepted (desktop only).
- **Export Vault File:** Export your encrypted Qards as a local .seqrets file for safekeeping in iCloud, Google Drive, or a USB drive.
- **Import Vault File:** Import a previously exported .seqrets file to restore your Qards into the app.
- **Flexible Backup Options:** Download your Qards as printable QR code images (PNG), as raw text files (TXT), or both.
- **Write to JavaCard Smartcard:** Store individual shares, full vaults, or keyfiles on JCOP3 hardware smartcards with optional PIN protection (desktop only).
- **Secure Memory Wipe:** seQRets automatically overwrites sensitive data in memory with random data immediately after use.

### Inheritance Plan
- **Standalone encryption** for heir instruction documents — no Qard shares required.
- Encrypt any file (PDF, DOCX, ODT, TXT — up to 5MB) with the same XChaCha20-Poly1305 + Argon2id security.
- Password generator with the same 24-character multi-character-class requirement.
- Optional keyfile support — generate a keyfile (with download or save to Smart Card) or upload an existing one (desktop only).
- After encrypting, users can **Save to File** (as seqrets-instructions.json) and/or **Write to Smart Card** (desktop only, if encrypted size fits within 8KB).
- Decrypt tab to restore the original document from the encrypted .json file or **load from Smart Card** (desktop only).
- Available on both web and desktop.

### Restore Your Secret
- **Drag & drop** QR code images from your file system.
- **Upload** Qard image files (PNG, JPG).
- **Scan** QR codes with your camera (desktop and web).
- **Manual text entry** — paste raw share data.
- **Import vault file** — load all shares at once from a .seqrets file.
- **Read from smartcard** — load shares or vaults directly from a JavaCard (desktop only).

### JavaCard Smartcard Support (Desktop Only)
- Store Shamir shares, encrypted vaults, or inheritance plans on JCOP3 JavaCard smartcards (e.g., J3H145).
- **Multi-item storage** — each card can hold multiple items (shares, vaults, keyfiles, instructions) up to ~8 KB total. New writes append to existing data on the card.
- **Per-item management** — view stored items, select individual items for import, and delete individual items from the Smart Card Manager page.
- **Keyfile smart card storage** — write keyfiles to a card from the Smart Card Manager page; load keyfiles from a card anywhere keyfiles are accepted (Secure Secret, Restore Secret, Inheritance Plan).
- **Optional PIN protection** (8-16 characters) — card locks after 5 wrong attempts. A real-time PIN retry countdown (color-coded: gray → amber → red) warns users of remaining attempts.
- **Generate PIN** button — uses CSPRNG to create a secure 16-character PIN (upper/lowercase, numbers, symbols) with copy-to-clipboard and reveal/hide toggle.
- **Smart Card Manager** page for PIN management, keyfile writing, per-item deletion, and factory reset.
- Requires a PC/SC-compatible USB smart card reader.

### Helper Tools
- **Password Generator** — cryptographically secure 32-character passwords.
- **Seed Phrase Generator** — generate valid BIP-39 mnemonic phrases (12 or 24 words).
- **Bitcoin Ticker** — live BTC/USD price display.
- **Bob AI Assistant** — Google Gemini-powered AI for setup guidance and questions (optional, user-provided API key). Users can disconnect Bob and remove their API key at any time via the "Remove API Key" link at the bottom of the chat interface.

## How to Use seQRets

The app guides you through a simple, step-by-step process.

### Encrypting a Secret (The "Secure Secret" Tab)
1.  **Step 1: Enter Your Secret.** Enter the secret you want to protect (e.g., a 12/24 word seed phrase). You can also use the **Seed Phrase Generator** to create a new one. Once done, click **Next Step**.
2.  **Step 2: Secure Your Secret.** Generate or enter a strong password (24+ characters with mixed character types). For maximum security, you can add a **Keyfile**. When your credentials are set, click **Next Step**.
3.  **Step 3: Split into Qards.** Choose the total number of Qards to create and how many are needed for restoration. When you're ready, click the final button to **Encrypt & Generate** your Qards. You can then download them, export as a vault file, or write to a smart card.

### Decrypting a Secret (The "Restore Secret" Tab)
1.  **Step 1: Add Your Qards.** Add the required number of shares using one of these methods:
    *   **Upload Images:** Drag and drop the Qard images.
    *   **Scan with Camera:** Scan the Qards one by one.
    *   **Manual Entry:** Paste the raw text of each share.
    *   **Import Vault File:** Load shares from a previously exported .seqrets file.
    *   **Read from Smartcard:** Load a share or vault from a JavaCard (desktop only).
    Once you've added enough shares, click **Next Step**.
2. **Step 2: Provide Your Credentials.** Enter the password that was used to encrypt the Qards. If a keyfile was used, upload the original file. When ready, click **Next Step**.
3. **Step 3: Restore Your Secret.** Click the final **Restore Secret** button to reveal the original data.

### Encrypting an Inheritance Plan
1. **Step 1: Upload Instructions File.** Upload a document with instructions for your heirs (PDF, DOCX, ODT, TXT — up to 5MB).
2. **Step 2: Provide Credentials.** Set a strong password (you can use the same one used for your Qards, or generate a new one). Optionally add a keyfile.
3. **Step 3: Encrypt.** Click Encrypt to secure the file.
4. **Step 4: Save.** Choose to Save to File (downloads as seqrets-instructions.json) and/or Write to Smart Card (desktop only, for files under 8KB).

To decrypt, go to the Decrypt tab, upload the encrypted .json file or load from a smart card (desktop only), and provide the same password (and keyfile if used).

## License

seQRets is licensed under the GNU Affero General Public License v3.0 (AGPLv3). Commercial licenses are available for organizations wanting to use seQRets in proprietary products — contact licensing@seqrets.app.
`;

const cryptoDetails = `
## DEEPER TECHNICAL DETAILS ##

*   **Key Derivation Function (KDF):**
    *   **Algorithm:** Argon2id
    *   **Iterations (Time Cost):** 3
    *   **Memory Cost:** 65536 (64 MB)
    *   **Parallelism:** 1
    *   **Salt Length:** 16 bytes (cryptographically random, generated per operation)
    *   **Derived Key Length:** 32 bytes (256 bits)

*   **Encryption Algorithm:**
    *   **Algorithm:** XChaCha20-Poly1305 (AEAD cipher)
    *   **Nonce Length:** 24 bytes (192 bits, cryptographically random)

*   **Compression:**
    *   **Algorithm:** Gzip (level 9)
    *   Applied before encryption to reduce payload size.

*   **Processing Order:**
    *   Secret -> Compress (gzip) -> Encrypt (XChaCha20-Poly1305) -> Split (Shamir's) -> Distribute
    *   Each Qard contains a fragment of the *encrypted* ciphertext — never raw plaintext.

*   **Secret Splitting:**
    *   **Algorithm:** Shamir's Secret Sharing
    *   The splitting happens *after* encryption. The raw, unencrypted secret is never split directly.
    *   This is a critical security design choice — a stolen Qard is computationally indistinguishable from random noise.

*   **Random Number Generation (CSPRNG):**
    *   All randomness is sourced from the Web Crypto API's crypto.getRandomValues(), a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) backed by the OS entropy pool (/dev/urandom on Linux/macOS, BCryptGenRandom on Windows).
    *   The @noble/hashes library's randomBytes() function wraps crypto.getRandomValues() and is used for salts, nonces, and BIP-39 entropy.
    *   Password generation: window.crypto.getRandomValues(new Uint32Array(32)) mapped to an 88-character charset.
    *   Keyfile generation: window.crypto.getRandomValues(new Uint8Array(32)) — 256 bits of raw random data.
    *   Seed phrase entropy: 128 bits (12 words) or 256 bits (24 words) via @scure/bip39's generateMnemonic().
    *   Encryption salt: 16 random bytes per operation. Encryption nonce: 24 random bytes per operation.
    *   No Math.random() or any weak PRNG is used for any security-critical operation.

*   **Seed Phrase Generator & Validation:**
    *   **Library:** @scure/bip39
    *   Generates 12-word (128-bit) or 24-word (256-bit) mnemonic phrases based on the BIP-39 standard.
    *   Seed phrases are automatically detected and converted to compact binary entropy before encryption (BIP-39 optimization).

*   **Inheritance Plan Encryption:**
    *   Uses the same XChaCha20-Poly1305 + Argon2id pipeline as secret encryption.
    *   Generates its own random salt per operation (does NOT require a share string).
    *   Output format: JSON with "salt" and "data" fields.
    *   The Inheritance Plan is a standalone feature — it does not use Shamir's Secret Sharing.

*   **JavaCard Smartcard:**
    *   JCOP3 J3H145 cards with ~110KB usable EEPROM.
    *   Maximum data per card: 8,192 bytes (8 KB). Each card can hold multiple items (shares, vaults, keyfiles, instructions) stored as a JSON array. New writes append to existing data.
    *   Communication via APDU over PC/SC (Rust pcsc crate).
    *   Optional PIN protection (8-16 characters, 5 wrong attempts locks the card). Real-time PIN retry countdown displayed after each failed attempt.
    *   CSPRNG-powered Generate PIN button creates secure 16-character PINs with copy and reveal/hide support.
    *   Per-item management: view stored items, select individual items for import, and delete individual items.
`;

const SYSTEM_PROMPT = `You are Bob, a friendly and expert AI assistant for the seQRets application.
Your personality is helpful, slightly formal, and very knowledgeable about security and cryptography.
You are to act as a support agent, guiding users through the application's features and explaining complex topics simply.

You MUST use the provided context from the seQRets documentation as your primary source of truth for questions about the seQRets app itself. Avoid terms like "end-to-end encryption" and instead prefer "client-side encryption" and "zero-knowledge architecture" when explaining how the app works.

## RESPONSE GUIDELINES ##

1.  **On Cryptocurrency:** Be precise. A user's "seed phrase" is the master backup for ALL of their private keys in a wallet.

2.  **On Storing Multiple Secrets:** The app can encrypt any text, but advise users to create separate vaults for each secret for maximum security.

3.  **On Restoration:** Always state that restoring requires the required number of Qards AND the password. If a keyfile was used, mention that too.

4.  **On Inheritance Planning:** Guide users on structuring their plan. The key is to eliminate single points of failure. Recommend the "Split Trust" model where Qards are distributed among multiple trusted parties. The password should NEVER be stored with the Qards. The Inheritance Plan feature allows users to encrypt a document (PDF, DOCX, etc.) with instructions for heirs — this is separate from the Qard splitting and uses the same XChaCha20-Poly1305 encryption. Users can save the encrypted plan as a file or write it to a smart card.

5.  **On Smart Cards:** Each JavaCard smartcard can hold multiple items (shares, vaults, keyfiles, or inheritance plans) up to ~8 KB total. New writes append to existing data on the card. Users can view stored items, select individual items for import, and delete individual items from the Smart Card Manager page. Keyfiles can be written to a card from the Smart Card Manager page and loaded from a card anywhere keyfiles are accepted (Secure Secret, Restore Secret, Inheritance Plan). PIN protection is optional but recommended. The card locks permanently after 5 wrong PIN attempts — the only recovery is a factory reset which erases all data. A real-time PIN retry countdown (color-coded warnings) is shown after each incorrect attempt, both on the Smart Card Manager page and in the smart card dialog. Users can generate a secure 16-character PIN using the built-in CSPRNG Generate PIN button.

6.  **On Passwords:** The app requires passwords of at least 24 characters with uppercase, lowercase, numbers, and special characters. The built-in password generator creates 32-character passwords. The password field turns green when valid and red when invalid.

## CONTEXT: seQRets Documentation ##
${readmeContent}

${cryptoDetails}`;

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gemini-api-key');
}

export function setApiKey(key: string) {
  localStorage.setItem('gemini-api-key', key);
}

export function removeApiKey() {
  localStorage.removeItem('gemini-api-key');
}

export async function askBob(input: AskBobInput): Promise<AskBobOutput> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return "I'm not available right now. To enable Bob, please add your Gemini API key in the settings.";
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  // Gemini requires the first history message to have role 'user'.
  // Strip any leading 'model' messages (e.g. the UI welcome greeting).
  const history = input.history || [];
  const firstUserIdx = history.findIndex(m => m.role === 'user');
  const trimmedHistory = firstUserIdx >= 0 ? history.slice(firstUserIdx) : [];

  const chat = model.startChat({
    history: trimmedHistory.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  });

  try {
    const result = await chat.sendMessage(input.question);
    const response = result.response;

    // Check for blocked responses before calling .text()
    if (response.promptFeedback?.blockReason) {
      console.warn('Prompt blocked:', response.promptFeedback);
      return "I'm sorry, I wasn't able to process that question. Could you try rephrasing it?";
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return "I'm sorry, I didn't get a response. Please try again.";
    }

    // Check for safety or other finish reason blocks
    const finishReason = candidate.finishReason;
    if (finishReason && !['STOP', 'MAX_TOKENS'].includes(finishReason)) {
      console.warn('Response blocked, finishReason:', finishReason);
      return "I'm sorry, I wasn't able to answer that question. Could you try rephrasing it?";
    }

    // Safely extract text
    const text = candidate.content?.parts?.map(p => p.text).join('') || '';
    if (!text) {
      return "I'm sorry, I received an empty response. Please try again.";
    }

    return text;
  } catch (e: any) {
    console.error('Bob API error:', e);
    const msg = e.message || '';
    if (msg.includes('API_KEY_INVALID') || msg.includes('401') || msg.includes('PERMISSION_DENIED')) {
      return 'Invalid API key. Please check your Gemini API key and try again.';
    }
    if (msg.includes('429') || msg.includes('RATE_LIMIT') || msg.includes('RESOURCE_EXHAUSTED')) {
      return "Too many requests. Please wait a moment and try again.";
    }
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
      return "The AI service is temporarily unavailable. Please try again in a few moments.";
    }
    if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      return "The AI model could not be found. The service may be updating — please try again later.";
    }
    return "I'm having trouble thinking right now. Please try asking your question again.";
  }
}
