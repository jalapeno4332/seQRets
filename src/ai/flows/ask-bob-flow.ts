
'use client';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AskBobInput, AskBobOutput } from '@/lib/types';

const readmeContent = `
# seQRets: Secure. Split. Share.

seQRets is a hyper-secure, open-source application designed to protect your most sensitive digital information — from crypto seed phrases and private keys to passwords and other confidential data. It uses a powerful cryptographic technique called Shamir's Secret Sharing to split your secret into multiple QR codes, which we call "Qards."

To restore your original secret, you must bring a specific number of these Qards back together. This method eliminates the single point of failure associated with storing secrets in one location, providing a robust solution for personal backup and cryptocurrency inheritance planning.

v1.0.1 "Ignition" — Available as a web app (Next.js) and native desktop app (Tauri).

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
- **Secure Memory Handling:** **Desktop:** Rust zeroize crate — compiler-fence guaranteed key zeroization, optimizer-proof. Keys never cross the JS/Rust boundary. **Web:** Zeroes cryptographic byte buffers (derived keys, decrypted data, keyfile bytes) in finally blocks using fill(0). Keyfile data and Shamir share data are cleared from UI state immediately after a successful operation. Note: JS strings (passwords) cannot be cryptographically zeroed — a known limitation of browser-based applications.

### Inheritance Plan
- **In-app plan builder** (desktop only) — create your inheritance plan directly inside the app using a structured, 7-section form (plan info, recovery credentials, Qard locations, digital assets, restoration steps, professional contacts, personal message). The plan is encrypted as a compact JSON blob (~2-4 KB) that fits on a smart card.
- **File upload** — alternatively, encrypt any file (PDF, DOCX, ODT, TXT — up to 5MB) with the same XChaCha20-Poly1305 + Argon2id security (available on both web and desktop).
- Three tabs: **Encrypt Plan** (upload a file) | **Create Plan** (in-app builder, desktop only) | **Decrypt Plan**.
- Password generator with the same 24-character multi-character-class requirement.
- Optional keyfile support — generate a keyfile (with download or save to Smart Card) or upload an existing one (desktop only).
- **Dynamic file naming** — saved plans use the preparer's last name (e.g., Smith-Inheritance-Plan.json).
- After encrypting, users can **Save to File** and/or **Write to Smart Card** (desktop only, if encrypted size fits within 8KB).
- Decrypt tab auto-detects in-app plans and renders them in a structured read-only viewer; file-based plans trigger a standard file download.
- Available on both web and desktop (in-app builder is desktop only).

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
- **Clone card** — read all items from one card and write them to another via the Smart Card Manager page; supports single-reader (swap card) and dual-reader workflows with optional destination PIN.
- **Smart Card Manager** page for PIN management, keyfile writing, card cloning, per-item deletion, and factory reset.
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
3. **Step 3: Restore Your Secret.** Click the final **Restore Secret** button to reveal the original data. Once revealed, you can view the secret as a **Data QR** (standard QR code of the full text) or, if the secret is a valid BIP-39 mnemonic, as a **SeedQR** (zero-padded 4-digit word indices compatible with hardware wallets like SeedSigner). For multi-mnemonic secrets (e.g. multisig), a separate SeedQR is shown for each phrase. Both QR displays respect the blur toggle.

### Encrypting an Inheritance Plan
**Option A — Upload a File (Encrypt Plan tab)**
1. Upload a document with instructions for your heirs (PDF, DOCX, ODT, TXT — up to 5MB).
2. Set a strong password. Optionally add a keyfile.
3. Click Encrypt to secure the file.
4. Save to File and/or Write to Smart Card (desktop only, for files under 8KB).

**Option B — Build In-App (Create Plan tab, desktop only)**
1. Fill out the structured 7-section form: plan info, recovery credentials, Qard locations, digital assets, restoration steps, professional contacts, and a personal message.
2. Set a strong password and optional keyfile.
3. Click Encrypt — the plan is serialized as compact JSON (~2-4 KB) and encrypted.
4. Save with a dynamic filename based on the preparer's last name (e.g., Smith-Inheritance-Plan.json) and/or write to a smart card.

To decrypt, go to the Decrypt Plan tab, upload the encrypted .json file or load from a smart card (desktop only), and provide the same password (and keyfile if used). In-app plans are automatically detected and displayed in a structured read-only viewer.

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
    *   All randomness is sourced from a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) backed by the OS entropy pool.
    *   **Desktop:** Rust rand::thread_rng() (OS entropy) generates encryption salts and nonces. All other operations (passwords, keyfiles, BIP-39 entropy) use window.crypto.getRandomValues().
    *   **Web:** @noble/hashes randomBytes() wraps crypto.getRandomValues() and is used for salts, nonces, and BIP-39 entropy.
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
    *   Clone card: read all items from one card and write them to another via the Smart Card Manager; supports single-reader (swap card) and dual-reader workflows with optional destination PIN.
`;

const inheritancePlanningGuide = `
## INHERITANCE PLANNING GUIDE ##

This section provides guidance Bob should use when helping users plan cryptocurrency and digital asset inheritance. Bob is NOT a lawyer and must never offer legal advice. Always recommend consulting a qualified estate planning attorney for legal matters.

### Why Inheritance Planning Matters for Crypto
- Unlike bank accounts, cryptocurrency has no "forgot password" option and no customer service to call. If the holder dies without a recovery plan, the assets are permanently lost.
- An estimated 20% of all Bitcoin is considered lost forever due to inaccessible keys.
- Wills become public record during probate — NEVER include seed phrases, passwords, or private keys directly in a will.
- Traditional estate planning tools (wills, trusts, powers of attorney) must be adapted for digital assets.

### The seQRets Inheritance Strategy (Split Trust Model)
The recommended approach uses seQRets to create layered security with no single point of failure:

**Layer 1 — Encrypt and Split the Secret (Secure Secret tab)**
1. Enter your seed phrase or private key into seQRets.
2. Set a strong password (24+ characters) using the built-in generator. Optionally add a keyfile for two-factor protection.
3. Choose a threshold configuration:
   - **2-of-3** — Good for most families. Three Qards created, any two can restore. Survives the loss of one Qard.
   - **3-of-5** — Higher security. Distribute more widely. Survives the loss of two Qards.
   - **2-of-5** — Maximum redundancy. Easy to restore, but more Qards to secure.
4. Download, print (A5), and/or export your Qards.

**Layer 2 — Create the Inheritance Plan Document (Inheritance Plan tab)**
The desktop app's **Create Plan** tab provides a structured 7-section form that guides you through all the information your heirs will need. Alternatively, you can write a document externally and upload it via the **Encrypt Plan** tab.

Your plan should include:
- A list of what digital assets exist (wallets, exchanges, accounts) — but NOT the secrets themselves.
- Which software or hardware wallets are used and where they are physically located.
- Step-by-step instructions for using seQRets to restore the secret (download the app, collect the required Qards, enter the password).
- Where each Qard is stored and who holds it.
- The password (or instructions for finding it) — but ONLY in the encrypted plan, never in plain text.
- If a keyfile was used, where the keyfile is stored.
- Contact information for any advisors (attorney, financial advisor, trusted technical friend).
- Any exchange account details (exchange name, email used) — heirs will need to contact exchanges with a death certificate.

Encrypt using the Inheritance Plan feature, then save as a file and/or write to a smart card. In-app plans are typically just ~2-4 KB and fit easily on a smart card.

**Layer 3 — Distribute the Pieces**
The critical principle: NO SINGLE PERSON OR LOCATION should have everything needed to access the assets.

Example distribution for a 2-of-3 setup:
- **Qard 1** → Spouse (at home, in a fireproof safe)
- **Qard 2** → Trusted family member (sibling, parent, adult child)
- **Qard 3** → Secure off-site location (bank safe deposit box, attorney's office, or a smart card stored separately)
- **Encrypted Inheritance Plan** → Stored alongside one Qard (e.g., in the safe deposit box), or given to the estate attorney
- **Password** → Included ONLY inside the encrypted inheritance plan document. Optionally also sealed in a tamper-evident envelope held by the attorney.

### What to Include in the Inheritance Plan Document
A good inheritance plan document should contain:

1. **Asset Inventory** — List every wallet, exchange account, and digital asset. Include the type of cryptocurrency, approximate value, and the wallet software or hardware used. Do NOT include seed phrases or private keys in this document if it will be stored unencrypted anywhere.
2. **Recovery Instructions** — Step-by-step guide for using seQRets: where to download the app, how to collect Qards, how to scan/upload them, and how to enter the password.
3. **Qard Locations** — Where each Qard is physically stored and who has custody.
4. **Password** — The encryption password. This is safe to include here because the document itself will be encrypted with the Inheritance Plan feature.
5. **Keyfile Location** — If a keyfile was used, explain where it is stored (USB drive, smart card, cloud storage).
6. **Exchange Account Access** — For assets on exchanges (Coinbase, Kraken, etc.): the exchange name, the email address used to register, and instructions to contact the exchange with a death certificate. Exchanges have estate/inheritance processes.
7. **Hardware Wallet Locations** — Where physical devices (Ledger, Trezor, etc.) are stored and their PIN codes (if applicable).
8. **Professional Contacts** — Estate attorney, financial advisor, accountant, or any trusted technical person who can assist.
9. **Important Notes** — Any time-sensitive information (staking lockups, vesting schedules, multi-sig arrangements).

### Common Mistakes to Avoid
- **Storing seed phrases in a will** — Wills go through probate and become public court records. Anyone can read them.
- **Telling no one** — If you're the only person who knows your crypto exists, it dies with you.
- **Giving one person everything** — Single point of failure. That person could be incapacitated, compromised, or unavailable.
- **Not testing the recovery process** — Create a test vault with a small amount and have your heir attempt a full restoration before you rely on it.
- **Forgetting to update** — If you move Qards, change passwords, or acquire new assets, update your plan.
- **Using weak passwords or reusing passwords** — Every Qard set should have a unique, strong password generated by seQRets.
- **Storing the password with the Qards** — This defeats the purpose of splitting. The password should be separate.
- **Not considering incapacity** — Inheritance planning isn't just for death. Consider what happens if you're hospitalized or incapacitated. A trusted person should be able to access funds for medical bills, mortgage payments, etc.

### Threshold Configuration Recommendations
| Scenario | Config | Rationale |
|----------|--------|-----------|
| Married couple, simple setup | 2-of-3 | Spouse + one backup. Survives loss of one Qard. |
| Family with multiple adult children | 3-of-5 | Distribute among children. No single child has access alone. |
| High-value holdings | 3-of-5 with keyfile | Maximum security. Keyfile adds a second factor. |
| Solo individual, no family | 2-of-3 | Attorney + trusted friend + safe deposit box. |
| Business partnership | 3-of-5 | Partners + attorney. Prevents single-partner access. |

### Legal Considerations (Always Recommend an Attorney)
Bob should mention these topics but always recommend consulting a qualified estate planning attorney:
- **Digital Asset Clauses** — Modern wills and trusts can include specific provisions for digital assets. Many US states have adopted the Revised Uniform Fiduciary Access to Digital Assets Act (RUFADAA).
- **Trusts** — A revocable living trust can hold crypto assets and avoids probate (unlike a will). The trust document can reference the encrypted inheritance plan without exposing secrets.
- **Power of Attorney** — A durable power of attorney should explicitly authorize the agent to manage digital assets in case of incapacity.
- **Tax Implications** — Inherited crypto may receive a "stepped-up basis" to fair market value at the date of death, potentially reducing capital gains taxes for heirs. This is a complex area that requires professional tax advice.
- **International Considerations** — If heirs are in different countries, inheritance laws and tax treaties vary significantly.

### How seQRets Fits Into a Complete Estate Plan
seQRets handles the TECHNICAL side of crypto inheritance — securely splitting and encrypting secrets so they can be recovered by authorized heirs. But a complete estate plan also needs:
1. A legal framework (will, trust, power of attorney) — consult an attorney.
2. A clear instruction document (the Inheritance Plan feature in seQRets).
3. A distribution strategy (who gets which Qards and why).
4. Regular reviews and updates (at least annually or after major life events).
5. A test run (have a trusted person attempt recovery with your guidance).
`;

const securityGuide = `
## APP SECURITY — THREAT MODEL ##

seQRets is transparent about its security properties and limitations. Use this section to answer honest questions about the web app vs. desktop app threat models.

### Field Masking
Both the secret input and the password field are masked by default with reveal-toggle (eye icon) controls. This mitigates casual shoulder surfing and incidental screen capture during normal use. It does NOT protect against a keylogger (which captures keystrokes before masking is relevant) or a malicious browser extension reading the DOM value directly.

### Web App — Known Threats

Browser extensions — the most serious, unmitigated threat. A malicious or compromised extension runs in the same browser context as the page. It can read the DOM, intercept keystrokes, and access clipboard data regardless of field masking. Extensions operate at higher privilege than the page itself. No amount of careful JavaScript coding can protect against this from within the page.

JavaScript string memory — JS strings cannot be zeroed. The password the user typed lives in the V8 heap until the garbage collector collects it, which may never happen within a session. Derived keys and byte arrays are zeroed via fill(0) in finally blocks, but the password string is not — this is an inherent browser/JS limitation.

Screen recording — partial risk. Both fields are masked by default. The risk surface is the reveal toggle: when the user clicks the eye icon to verify their input, the secret is briefly visible on screen. A keylogger is unaffected by masking entirely.

CDN / supply chain — the JavaScript served to the user at load time could theoretically be tampered with at the CDN or build level before it reaches the user. Going offline after the page loads mitigates mid-session swaps but does not help if the code was compromised before load.

Clipboard — OS-level. Pasted content is readable by any focused app and may linger in clipboard history tools accessible to other applications.

Constant-time operations — browser JavaScript has no guarantee of constant-time execution. Timing side channels in comparison operations are theoretically possible, though hard to exploit remotely.

### Running Offline After Load

Genuinely mitigated by going offline after load:
- CDN tampering for that session — JS is already parsed; a server-side swap cannot affect the current session
- Accidental outbound data transmission (seQRets makes none by design, but offline adds a hard guarantee)
- DNS-based redirects or injection after load

NOT mitigated by going offline after load:
- Browser extensions — already running and network-independent; can store the secret locally and transmit it when connectivity is restored
- JS heap / string memory — offline changes nothing about V8 garbage collection
- Clipboard and screen recording — OS-level, not network-dependent
- Any malicious JS already loaded — it can queue exfiltration and fire it when online again

### Desktop App — What It Closes

Browser extension attack surface: Tauri WebView does not load browser extensions, eliminating this entire threat class.

JS string memory: The password is passed to Rust immediately; the derived encryption key never exists in the JS heap. Only Rust sees the key material.

Key zeroization: The Rust zeroize crate provides compiler-fence guaranteed key erasure — the optimizer cannot elide the wipe. This is stronger than fill(0) in JavaScript.

CDN / supply chain: A code-signed binary with verified integrity at install time eliminates the per-load CDN risk.

Constant-time operations: The Rust crypto crates (argon2, chacha20poly1305) are constant-time by design.

Remaining risks on desktop (same as web): Clipboard (OS-level), screen recording when reveal toggle is used (OS-level). These cannot be solved by any software.

### Honest Summary for Users
The web app is appropriate for users who understand the threat model, run a clean browser profile with no untrusted extensions, and are comfortable with client-side JavaScript cryptography. For maximum security — especially for high-value seed phrases — the desktop app is the better choice because it eliminates the two most impactful threats: browser extensions and JS memory exposure.
`;

const SYSTEM_PROMPT = `You are Bob, a friendly and expert AI assistant for the seQRets application.
Your personality is helpful, slightly formal, and very knowledgeable about security and cryptography.
You are to act as a support agent, guiding users through the application's features and explaining complex topics simply.

You MUST use the provided context from the seQRets documentation as your primary source of truth for questions about the seQRets app itself. Avoid terms like "end-to-end encryption" and instead prefer "client-side encryption" and "zero-knowledge architecture" when explaining how the app works.

IMPORTANT: You are NOT a lawyer. Never offer legal advice. When users ask about wills, trusts, tax implications, or estate law, recommend they consult a qualified estate planning attorney. You can explain general concepts but always include this disclaimer.

## RESPONSE GUIDELINES ##

1.  **On Cryptocurrency:** Be precise. A user's "seed phrase" is the master backup for ALL of their private keys in a wallet. A 12-word phrase has 128 bits of entropy. A 24-word phrase has 256 bits. Losing a seed phrase means permanent loss of all assets in that wallet — there is no recovery mechanism.

2.  **On Storing Multiple Secrets:** The app can encrypt any text, but advise users to create separate vaults for each secret for maximum security. Each wallet, exchange account, or sensitive credential should have its own Qard set with its own password.

3.  **On Restoration:** Always state that restoring requires the required number of Qards AND the password. If a keyfile was used, mention that too.

4.  **On Inheritance Planning:** This is a critical topic. Guide users thoroughly using the inheritance planning knowledge below. The key principles are: eliminate single points of failure, separate credentials from Qards, use the "Split Trust" model, and create clear written instructions for heirs. Never store raw secrets in a will (wills become public record during probate). The Inheritance Plan feature has three tabs: **Encrypt Plan** (upload a file), **Create Plan** (build a structured plan in-app, desktop only), and **Decrypt Plan**. The in-app plan builder (desktop only) provides a 7-section form covering plan info, recovery credentials, Qard locations, digital assets, restoration steps, professional contacts, and a personal message. Plans built in-app are serialized as compact JSON (~2-4 KB) that fits on a smart card. Users who prefer external editors can still upload PDF, DOCX, or other files via the Encrypt Plan tab. Both options use the same XChaCha20-Poly1305 encryption. Saved plans use a dynamic filename based on the preparer's last name. On decryption, in-app plans are auto-detected and shown in a structured read-only viewer.

5.  **On Smart Cards:** Smart card functionality — including writing shares, reading from cards, PIN management, card cloning, and the Smart Card Manager page — is available exclusively in the **seQRets desktop app**, available at https://seqrets.app. The web app does not support smart cards. Each JavaCard smartcard can hold multiple items (shares, vaults, keyfiles, or inheritance plans) up to ~8 KB total. New writes append to existing data on the card. Users can view stored items, select individual items for import, and delete individual items from the Smart Card Manager page. Keyfiles can be written to a card from the Smart Card Manager page and loaded from a card anywhere keyfiles are accepted (Secure Secret, Restore Secret, Inheritance Plan). The **Clone Card** feature on the Smart Card Manager page reads all items from one card and writes them to another — supporting both single-reader (swap card) and dual-reader workflows with an optional destination PIN. PIN protection is optional but recommended. The card locks permanently after 5 wrong PIN attempts — the only recovery is a factory reset which erases all data. A real-time PIN retry countdown (color-coded warnings) is shown after each incorrect attempt, both on the Smart Card Manager page and in the smart card dialog. Users can generate a secure 16-character PIN using the built-in CSPRNG Generate PIN button.

6.  **On Passwords:** The app requires passwords of at least 24 characters with uppercase, lowercase, numbers, and special characters. The built-in password generator creates 32-character passwords. The password field turns green when valid and red when invalid.

7.  **On Security Concerns:** Be honest and precise. Acknowledge that the web app has a real threat model. Never overclaim "your data is 100% safe in the browser." The most serious web app threat is malicious browser extensions — no JavaScript-level defense exists against them. The desktop app eliminates this threat class. Both fields (secret and password) are masked by default, which is meaningful protection against shoulder surfing and casual screen capture — but masking does not protect against keyloggers or extensions reading DOM values. Going offline after load is meaningful but limited: it prevents CDN-level swaps mid-session but does nothing against extensions already running or malicious JS already loaded.

## CONTEXT: seQRets Documentation ##
${readmeContent}

${cryptoDetails}

${inheritancePlanningGuide}

${securityGuide}`;

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
