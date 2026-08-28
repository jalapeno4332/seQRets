
'use client';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AskBobInput, AskBobOutput } from '@/lib/types';

const readmeContent = `
# seQRets: Secure. Split. Share.

seQRets is a hyper-secure, open-source application designed to protect your most sensitive digital information — from crypto seed phrases and private keys to passwords and other confidential data. It uses a powerful cryptographic technique called Shamir's Secret Sharing to split your secret into multiple QR codes, which we call "Qards."

To restore your original secret, you must bring a specific number of these Qards back together. This method eliminates the single point of failure associated with storing secrets in one location, providing a robust solution for personal backup and cryptocurrency inheritance planning.

seQRets is available as a web app (Next.js) and a native desktop app (Tauri).

## Core Features

### Secure Your Secret
- **Shamir's Secret Sharing:** Split any text-based secret into a configurable number of Qards. You decide how many are needed for recovery (e.g., 2-of-3, 3-of-5 threshold).
- **Optional Qard Share Data in QR (v1.11+):** A toggle on the create-shares form labeled "Include Qard Share Data (K of N) in QR" (default ON) embeds the threshold (K), total (N), and 1-based index (I) inside each Qard's QR data. The metadata is covered by the SHA-256 hash, which detects accidental corruption or damage — but not deliberate tampering (the hash is unkeyed and travels with the Qard, so someone who reprints a Qard can recompute a matching hash). During restoration, the app shows a live countdown — for example, "Set ABC12345 — 2 of 3 added · 1 more Qard required". Helpful for heirs decades from now who may not know how many Qards a set contains. Trade-off: anyone who scans a Qard learns K and N; without the password, that information cannot recover the secret but it does narrow what an attacker is searching for. Older Qards generated before this feature still work, just without the countdown.
- **Strong Encryption:** Your secret is compressed (gzip level 9), then encrypted on the client-side using **XChaCha20-Poly1305** (AEAD). The encryption key is derived from your password and an optional keyfile using **Argon2id**, a memory-hard key derivation function.
- **Client-Side Security:** All cryptographic operations happen on your device. Your raw secret and password are never sent to any server. This is a core principle of our zero-knowledge architecture.
- **Password Generator:** A built-in tool to generate a high-entropy, 32-character password. Passwords must be at least 24 characters and include uppercase, lowercase, numbers, and special characters. The password field shows green when valid, red when not.
- **Seed Phrase Generator:** A tool to generate a new 12 or 24-word BIP-39 mnemonic seed phrase.
- **BIP-39 Optimization:** Seed phrases are automatically detected and converted to compact binary entropy before encryption. A 24-word phrase (~150 characters) becomes just 32 bytes, dramatically reducing QR code size.
- **SLIP-39 Detection:** Trezor-style SLIP-39 recovery shares (20 or 33 words — the format Trezor Suite now creates by default) are automatically recognized and checksum-validated when entered, so a mistyped word is caught before encryption. They are stored exactly as entered (no compression). After restoration, the share is checksum-verified again and shown as a numbered word list for easy typing into the hardware wallet. SeedQR display is not offered for SLIP-39 — SeedQR is a BIP-39-only format, and SLIP-39 wallets restore by typing words, not scanning.
- **Optional Label & "Show label on Qards & file names" switch (v1.14+):** the optional label is always stored in ENCRYPTED form inside the secret's payload and reappears on restore. By default it is ALSO printed in plain text on each Qard's face and used in PNG/TXT/ZIP/vault file names for easy sorting — anyone who sees a card or file can read it there. A switch next to the label input (shown once a label is entered) turns that off for a "blind" export: cards show only the card number and set ID, files are named seQRets-Qard-01 and so on, and (on desktop) smart-card item labels are generic too. Advise users to avoid amounts, exchange names, or other sensitive hints in labels they intend to print, or to use the blind-export switch.
- **Optional Keyfile:** For enhanced security, you can use any file as an additional "key." Both the password AND the keyfile are required for recovery. Users can generate a keyfile and either download it or save it to a smart card. Keyfiles can also be loaded from a smart card anywhere keyfiles are accepted (desktop only).
- **Export Vault File:** Export your encrypted Qards as a local .seqrets file for safekeeping in iCloud, Google Drive, or a USB drive. Vault files can optionally be encrypted with their own password (separate from the secret's encryption password) for an additional layer of protection.
- **Import Vault File:** Import a previously exported .seqrets file to restore your Qards into the app.
- **Flexible Backup Options:** Download individual Qards as QR code images (PNG) or raw text files (TXT), or download all Qards at once as a ZIP archive (includes PNGs, TXTs, and encrypted instructions). Print individual Qards or all Qards in A5 card format directly from the app.
- **Write to JavaCard Smartcard:** Store individual shares, full vaults, or keyfiles on JCOP3 hardware smartcards with optional PIN protection (desktop only).
- **QR Code Size Estimation:** Real-time byte estimate per share with a visual progress bar during encryption. Warnings appear when share data approaches QR scanning reliability limits (~900 bytes yellow warning, ~1400 bytes red warning). Oversized payloads automatically switch to text-only export mode.
- **QR Scanability Prevention:** After encryption, each generated QR code is automatically verified for scanability. If any Qard produces an unscannable QR code, the user is prompted with a modal dialog to re-encrypt (which generates new random salt/nonce and may produce scannable results) or to export as text-only files instead. This prevents users from distributing QR Qards that cannot be scanned during recovery.
- **Secure Memory Handling:** **Desktop:** Rust zeroize crate — compiler-fence guaranteed key zeroization, optimizer-proof. The derived encryption key stays entirely in Rust and never enters the JS heap. The password string does transit JS briefly via IPC but cannot be zeroed (JS string limitation). **Web:** Zeroes cryptographic byte buffers (derived keys, decrypted data, keyfile bytes) in finally blocks using fill(0). Keyfile data and Shamir share data are cleared from UI state immediately after a successful operation. Note: JS strings (passwords) cannot be cryptographically zeroed — a known limitation of browser-based applications.
- **Clipboard Auto-Clear:** When copying a restored secret or seed phrase to the clipboard, the app automatically clears the clipboard after 60 seconds to prevent accidental exposure.

### Inheritance Plan
- **How it differs from Qards:** inheritance plans use the same encryption primitives as Qards (XChaCha20-Poly1305 + Argon2id, with optional keyfile) but are **not** split with Shamir's Secret Sharing. An encrypted plan is a single file — saved to disk and/or written to a single smart card — that an heir decrypts with one password (plus the keyfile if one was used). No multi-card threshold, no split shares. The plan typically holds the *instructions* heirs need to find and use the Qards, while the Qards themselves hold the actual cryptographic secrets.
- **In-app plan builder** (desktop only) — create your inheritance plan directly inside the app using a structured, 9-section form (plan info, beneficiaries, seQRet sets with Qard locations, device & account access, digital asset inventory, restoration steps, professional contacts, emergency access, personal message). The plan is encrypted as a compact JSON blob (~2-4 KB) that fits on a smart card.
- **2FA deadlock warning** — Section 3 (Device & Account Access) includes a prominent warning about circular dependency traps: if your password manager requires a 2FA code and your 2FA app login is stored inside that password manager, neither can be opened first. The plan prompts users to list their 2FA/authenticator app recovery credentials as a separate entry to break the loop.
- **Sensitive field masking** (desktop only, v1.7.2+) — In the in-app plan builder, password and PIN fields (seQRets Password, Smart card PIN, Device password) render as dots with an eye toggle; Recovery seed / key fields auto-blur their characters once typed (while keeping the input border and placeholder crisp). All default to hidden; click the eye to confirm accuracy, then it re-hides. Each entry across multiple seQRet Sets, Device Accounts, and Digital Assets has its own independent toggle.
- **File upload** — alternatively, encrypt any file (PDF, DOCX, ODT, ODS, ODP, JSON, TXT — up to 50MB) with the same XChaCha20-Poly1305 + Argon2id security (available on both web and desktop).
- Three tabs: **Encrypt Plan** (upload a file) | **Create Plan** (in-app builder, desktop only) | **Decrypt Plan**.
- Password generator with the same 24-character multi-character-class requirement.
- Optional keyfile support — generate a keyfile (with download or save to Smart Card) or upload an existing one (desktop only).
- **Dynamic file naming** — saved plans use the preparer's last name (e.g., Smith-Inheritance-Plan.json).
- After encrypting, users can **Save to File** and/or **Write to Smart Card** (desktop only, if encrypted size fits within 8KB).
- **PDF export** (desktop only) — after encrypting an in-app plan or after decrypting one, users can export a printable PDF document with all 9 sections formatted as a clear, readable paper document. This is designed for heirs who need instructions without needing the app. The PDF is generated client-side and never transmitted.
- Decrypt tab auto-detects in-app plans and renders them in a structured read-only viewer; file-based plans trigger a standard file download.
- **Review reminders** (desktop only, v1.8.0+) — opt-in local reminder that nudges users to open and verify their inheritance plan on a 6/12/24 month schedule. A plaintext sidecar file (review-reminder.json) in the app data directory stores only the next review date — no plan contents, no encryption material. After decrypting a plan, users click "Mark as reviewed" to reset the timer. A banner appears on the home tab and an amber badge dot on the Inheritance Plan nav tab when a review is due. Optional OS notification on app launch (generic text, no plan details on lock screen). Fully local, no server. Can be snoozed 7 days, interval changed, or disabled and deleted from the review panel in the plan viewer. On machine switch or reinstall, the reminder rebuilds from the plan's encrypted lastReviewedAt field on the next decrypt.
- Available on both web and desktop (in-app builder is desktop only).

### Restore Your Secret
- **Drag & drop** QR code images from your file system.
- **Upload** Qard image files (PNG, JPG).
- **Scan** QR codes with your camera (desktop and web).
- **Manual text entry** — paste raw share data.
- **Import vault file** — load all shares at once from a .seqrets file.
- **Read from smartcard** — load shares or vaults directly from a JavaCard (desktop only).
- **Per-set recovery countdown (v1.11+):** Dropped Qards are grouped by their 8-character set ID. When the Qards carry the optional recovery metadata (see "Include Qard Share Data" feature), a live countdown shows progress: "Set ABC12345 — 2 of 3 added · 1 more Qard required" (amber while below threshold, green at threshold). For Qards without the metadata, just the count is shown. A warning appears if Qards from multiple distinct sets are dropped, since they cannot decrypt together.

### JavaCard Smartcard Support (Desktop Only)
- Store Shamir shares, encrypted vaults, or inheritance plans on JCOP3 JavaCard smartcards (e.g., J3H145).
- **Multi-item storage** — each card can hold multiple items (shares, vaults, keyfiles, instructions) up to ~8 KB total. New writes append to existing data on the card.
- **Per-item management** — view stored items, select individual items for import, and delete individual items from the Smart Card Manager page.
- **Keyfile smart card storage** — write keyfiles to a card from the Smart Card Manager page; load keyfiles from a card anywhere keyfiles are accepted (Secure Secret, Restore Secret, Inheritance Plan).
- **Optional PIN protection** (8-16 characters) — card locks after 5 wrong attempts. A real-time PIN retry countdown (color-coded: gray → amber → red) warns users of remaining attempts.
- **Generate PIN** button — uses CSPRNG to create a secure 16-character PIN (upper/lowercase, numbers, symbols) with copy-to-clipboard and reveal/hide toggle.
- **Wipe protection** — opt-in flag that prevents factory reset (forceEraseCard) unless the correct PIN is provided first. When wipe protection is enabled and the card is locked (0 PIN retries remaining), the data becomes permanently inaccessible by design — the card cannot be erased or read. This is intended for high-security scenarios where data destruction prevention is more important than card recovery.
- **Clone card** — read all items from one card and write them to another via the Smart Card Manager page; supports single-reader (swap card) and dual-reader workflows with optional destination PIN.
- **Smart Card Manager** page for PIN management, keyfile writing, card cloning, per-item deletion, wipe protection toggle, and factory reset.
- Requires a PC/SC-compatible USB smart card reader.

### Helper Tools
- **Password Generator** — cryptographically secure 32-character passwords.
- **Seed Phrase Generator** — generate valid BIP-39 mnemonic phrases (12 or 24 words).
- **Bitcoin Ticker** — live BTC/USD price display.
- **Connection Status** — real-time online/offline indicator in the footer. Uses a periodic ping (every 5 seconds) to reliably detect connectivity, not just browser events. Red dot + "Online" means the device has internet access; green dot + "Offline" means the device is safely disconnected. The inverted colors are intentional — for a security app, being offline is the safer state.
- **Bob AI Assistant** — Google Gemini-powered AI for setup guidance and questions (optional, user-provided API key). Users choose whether to remember their key (saved to localStorage on web, OS keychain on desktop) or use it for the current session only. Users can disconnect Bob and remove their API key at any time via the "Remove API Key" link at the bottom of the chat interface.
- **PWA Install Banner** — the web app can be installed as a Progressive Web App (PWA) on desktop and mobile for offline use. A smart install banner appears with browser-specific instructions (Chrome, Edge, Safari, Firefox, etc.). Installing as a PWA gives a native-like experience without needing the desktop app.

### Zero-Knowledge Architecture
seQRets has no servers, no accounts, and no data collection. Nothing is ever sent to a server — all encryption and decryption happens entirely on the user's device. There is no backend, no database, no analytics, and no telemetry. The developers never see user data and cannot recover secrets. The web app is a static site hosted on GitHub Pages with a service worker for offline support. The desktop app is a self-contained binary. This is true zero-knowledge: we don't just promise not to look at your data — we architecturally cannot.

### seQRets Recover — Long-Term Recovery
**seQRets Recover** is a separate, independent recovery tool at https://github.com/seQRets/seQRets-Recover. It is a single \`recover.html\` file — a small, self-contained codebase (~400-line crypto core), all dependencies inlined — that can reassemble and decrypt seQRets Qards with nothing but a web browser. No install, no network, no backend.

**Why it matters:** if seqrets.app ever goes offline, the company dissolves, or the main app stops being updated, users can still recover their secrets. Recover is a hedge against developer risk. It uses the same audited cryptographic primitives as the main app (Argon2id, XChaCha20-Poly1305, Shamir's Secret Sharing, @scure/bip39). The seQRets share format (\`seQRets|<salt>|<nonce+ciphertext>\` with a \`|v=1\` format-version segment (v1.14+), optional \`|t=K|n=N|i=I\` recovery metadata, and a trailing \`|sha256:<hex>\` integrity hash) is plaintext, self-describing, and documented — anyone could write their own recovery tool in an afternoon.

**How users get it:**
- Overview page on the website: https://seqrets.app/recover
- Download \`recover.html\` from the latest release: https://github.com/seQRets/seQRets-Recover/releases/latest/download/recover.html
- Hosted version (runs in any modern browser, no install): https://seqrets.github.io/seQRets-Recover/
- **Referenced inside the Inheritance Plan itself (as of v1.10.3)** — Section 6 (default "How to Restore" steps) lists \`recover.html\` as a fallback under step 1, and Section 8 (Emergency Access procedure) pre-fills with a default that points back at Section 6. Heirs who open the decrypted plan PDF see the tool mentioned inline — no in-app alerts are used, because those surface in the wrong audience (the plan author, not the heir).
- Every release publishes a SHA-256 hash so the copy can be verified before being handed to heirs
- Build it from source — \`npm install && npm run build\` produces the single HTML file

**When to mention it:** only surface the Recovery Tool when the user explicitly asks about longevity, vendor risk, or what happens if seQRets goes away. Do NOT proactively bring it up — constant reassurance about the company disappearing undermines confidence in the product. If asked, suggest the user save a copy of \`recover.html\` alongside their Qards so it's available later if needed.

## How to Use seQRets

The app guides you through a simple, step-by-step process.

### Encrypting a Secret (The "Secure Secret" Tab)
1.  **Step 1: Enter Your Secret.** Enter the secret you want to protect (e.g., a 12/24 word seed phrase). You can also use the **Seed Phrase Generator** to create a new one. Once done, click **Next Step**.
2.  **Step 2: Secure Your Secret.** Generate or enter a strong password (24+ characters with mixed character types). For maximum security, you can add a **Keyfile**. When your credentials are set, click **Next Step**.
3.  **Step 3: Split into Qards.** Choose the total number of Qards to create and how many are required for restoration. When you're ready, click the final button to **Encrypt & Generate** your Qards. You can then download them individually (PNG/TXT), download all as a ZIP archive, print as A5 cards, export as a vault file, or write to a smart card.

### Decrypting a Secret (The "Restore Secret" Tab)
1.  **Step 1: Add Your Qards.** Add the required number of shares using one of these methods:
    *   **Upload Images:** Drag and drop the Qard images.
    *   **Scan QR:** Scan the Qards one by one with your camera.
    *   **Paste Text:** Paste the raw text of each share.
    *   **Import Vault File:** Load shares from a previously exported .seqrets file. If the vault was password-protected, you will need the vault password to import.
    *   **Read from Smartcard:** Load a share or vault from a JavaCard (desktop only).
    Once you've added enough shares, click **Next Step**.
2. **Step 2: Provide Your Credentials.** Enter the password that was used to encrypt the Qards. If a keyfile was used, upload the original file. When ready, click **Next Step**.
3. **Step 3: Restore Your Secret.** Click the final **Restore Secret** button to reveal the original data. Once revealed, tapping the **QR icon** in the textarea corner opens a dialog with two tabs: **QR Code** (standard QR of the full text) and, if the secret is a valid BIP-39 mnemonic, **SeedQR** for scanning into a compatible hardware wallet. The SeedQR tab offers two formats via a toggle: **Standard** (each word encoded as a 4-digit numeric index) and **Compact** (the raw BIP-39 entropy encoded as bytes — a smaller, denser code; the wallet recomputes the checksum). For multi-mnemonic secrets (e.g. multisig), a separate SeedQR is shown for each phrase. The QR is **blurred by default** every time the dialog opens — use the eye toggle to reveal when you're ready to scan. On the SeedQR tab we also display the **BIP-32 master fingerprint** (XFP, 8 hex chars) underneath each QR; most hardware wallets show this on their home screen after import, so users can verify the right seed was loaded even on devices that never display the mnemonic itself. The fingerprint is computed with no BIP-39 passphrase — if the user adds a passphrase at wallet-import time the on-device fingerprint will differ. The dialog is view-only — there is no download option, by design (the recovery workflow is scan-only to avoid encouraging plaintext files of decrypted secrets).

### Encrypting an Inheritance Plan
**Option A — Upload a File (Encrypt Plan tab)**
1. Upload a document with instructions for your heirs (PDF, DOCX, ODT, ODS, ODP, JSON, TXT — up to 50MB).
2. Set a strong password. Optionally add a keyfile.
3. Click Encrypt to secure the file.
4. Save to File and/or Write to Smart Card (desktop only, for files under 8KB).

**Option B — Build In-App (Create Plan tab, desktop only)**
1. Fill out the structured 9-section form: plan info, beneficiaries, secret sets with Qard locations, device & account access, digital asset inventory, restoration steps, professional contacts, emergency access, and a personal message.
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
    *   **Iterations (Time Cost):** 4
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
    *   Secret -> Compress (gzip) -> Encrypt (XChaCha20-Poly1305) -> Split (Shamir's) -> SHA-256 Hash -> Distribute
    *   Each Qard contains a fragment of the *encrypted* ciphertext — never raw plaintext.

*   **Secret Splitting:**
    *   **Algorithm:** Shamir's Secret Sharing
    *   **Library:** shamir-secret-sharing (by Privy) — zero dependencies, independently audited by Cure53 and Zellic
    *   The splitting happens *after* encryption. The raw, unencrypted secret is never split directly.
    *   This is a critical security design choice — a stolen Qard is computationally indistinguishable from random noise.

*   **SHA-256 Integrity Hash (v1.9.0+):**
    *   Each share embeds a SHA-256 hash as an optional trailing pipe-delimited segment: seQRets|salt|data[|v=1][|t=K|n=N|i=I]|sha256:<64hex>. As of v1.11.1 the hash is always the LAST segment when present, so the hash input is simply "everything before |sha256:". (Some Qards generated under v1.11.0 placed the sha256 segment between data and the metadata; the parser still accepts that older layout for backward compatibility.)
    *   **Format version segment (v1.14+):** every new Qard carries v=1 as its first metadata segment, covered by the SHA-256 hash like everything else. Its job is future-proofing frozen artifacts: if the format ever changes, software can tell "this backup is damaged" (hash mismatch) apart from "this software is too old for this Qard" (a clear update-your-app error). Qards without a v= segment are older ones and restore under the original rules. Older apps and older recover.html copies simply ignore the v=1 segment and restore v=1 Qards normally.
    *   **Length privacy (v1.14+):** before encryption, the compressed secret is padded with zeros up to 192-byte steps. Without this, the encrypted data's size would hint at the secret's size — for example, a single stolen Qard could reveal whether it protects a 12-word or a 24-word seed phrase. With padding, common secrets of different sizes produce identically-sized Qards. The padding is invisible: it is removed automatically on restore, and even older software and old recover.html copies handle padded Qards without knowing about the feature.
    *   The hash covers everything before the trailing |sha256: segment — that's the share data plus any recovery metadata. It cannot be reversed to recover the share, but any change to the data or metadata changes the hash, so tampering is detected.
    *   **At generation (web and desktop):** All shares are hashed and verified round-trip before being presented to the user. The hash is embedded in every Qard regardless of platform.
    *   **At restore (web and desktop):** Shares are automatically verified when scanned or imported. If a hash mismatch is detected, an error is raised before decryption is attempted.
    *   **Visual indicator (desktop only):** Desktop surfaces a green shield icon at restore time confirming the validation result. The web app runs the same check but does not yet display a visible badge.
    *   **Backward compatible:** Legacy 3-part shares (without a hash) are still accepted on restore — they just skip verification.
    *   **Printed SHA-256 fingerprint on Qards (desktop only):** Every desktop-printed Qard shows a truncated SHA-256 (first 8 + last 8 hex chars) on its face, e.g. "SHA-256: 3422d88d...e60442cc". This is the same hash embedded in the QR string, just printed in human-readable form. Practical uses, in order of usefulness:
        *   **Catalog/audit fingerprint (primary use):** Users record each Qard's hash in a separate document — inheritance instructions, notary log, written ledger. Decades later an heir can pick up a Qard and confirm it matches what was originally generated, without scanning or trusting any device. The printed hash is the maker's "this is the Qard I created on <date>" commitment.
        *   **Tampering detection (only with an external record):** If the heir's instructions list one hash and the printed Qard shows another, the Qard has been swapped. Without an external record this defense is weak — a forger could print a self-consistent hash on a substitute Qard.
        *   **Print/scan corruption check:** If the printer streaked or paper faded, scanning the QR yields data whose computed hash won't match the printed one. Heir knows to grab a different Qard from the set rather than trust a damaged one.
        *   **Recovery trust UX:** When the desktop app's restore flow shows the green verified shield, the heir can also visually compare the scanned hash to the printed hash for tangible confirmation.
        *   **Visual disambiguation:** When multiple Qards are physically together, the truncated fingerprint distinguishes them at a glance without scanning.
        *   **Honest framing:** The printed hash earns its keep when paired with an externally-recorded reference. On its own it's not tamper-evident. Encourage users who care about substitution protection to write their Qard hashes into a separate document (estate plan, notary log) at the time of generation.
    *   **Manual verification (plain English for users):** Copy the Qard's QR data, delete the |sha256:... chunk at the end, then hash what's left. The result should match the 64 hex characters you removed.
        *   Current Qards (v1.14+): echo -n 'seQRets|salt|data|v=1|t=K|n=N|i=I' | shasum -a 256
        *   Older Qards with recovery metadata: echo -n 'seQRets|salt|data|t=K|n=N|i=I' | shasum -a 256
        *   Without recovery metadata: echo -n 'seQRets|salt|data' | shasum -a 256
        *   The single quotes are important — the QR data contains | characters that would otherwise confuse the shell. echo -n (no trailing newline) is also important; without -n the hash will be wrong.
        *   For Qards generated under v1.11.0 with the sha256 segment in the middle, the same rule applies: paste the full string, delete the |sha256:... chunk wherever it sits, hash what's left.

*   **CRITICAL — Bob cannot perform cryptographic operations:**
    *   You are a text-only assistant. You cannot compute SHA-256 hashes, verify shares, encrypt or decrypt data, generate random values, or perform ANY cryptographic operation. Do not invent hex strings, hashes, or ciphertext — fabricated cryptographic output in a security-critical context is dangerous.
    *   If a user asks you to hash, verify, decrypt, or compute anything cryptographic, politely explain that you cannot do that and direct them to either: (a) the app's built-in auto-verification (runs on web and desktop — desktop additionally shows a green shield icon when integrity passes), or (b) the terminal command for manual SHA-256 verification — copy the Qard string, delete the |sha256:... chunk, hash what's left: echo -n 'seQRets|salt|data|t=K|n=N|i=I' | shasum -a 256 (or just 'seQRets|salt|data' for older Qards without recovery metadata). The output should match the 64 hex characters they removed.
    *   Never pretend to compute something you cannot actually compute.

*   **Quantum Resistance (IMPORTANT — answer honestly, don't oversell):**
    The seQRets scheme is quantum-resistant under its own assumptions. Use the following scheme-level framing when users ask about quantum attacks, Grover's algorithm, Shor's algorithm, or post-quantum security:
    *   **Scheme-level argument:** Shamir's Secret Sharing is information-theoretically secure — with fewer than K shares (the threshold), an adversary has literally zero bits of information about the secret. This is a mathematical property of polynomial interpolation over finite fields, not a computational assumption. No quantum computer changes this. Grover's algorithm doesn't apply, Shor's algorithm doesn't apply, and no future quantum breakthrough can apply, because there is no hidden structure to exploit.
    *   **Why XChaCha20's quantum vulnerability is irrelevant in the primary threat model:** While fewer than K shares are compromised, the ciphertext is never reconstructed. The XChaCha20-Poly1305 layer is therefore never attacked at all. Its (partial) vulnerability to Grover-accelerated search is only relevant after scheme failure.
    *   **Defense-in-depth for scheme failure:** If an attacker has somehow obtained ≥ K shares (a failure of share distribution, not of the cryptography), the cipher layer still provides post-quantum margin. XChaCha20-Poly1305's 256-bit key provides ~128-bit effective post-quantum security under Grover's algorithm. Argon2id's memory-hardness (64 MB, 4 iterations) further raises the cost of brute-forcing the password. The built-in password generator produces passwords with ~10^62 combinations, putting Grover-accelerated brute-force beyond any realistic attacker (~10^18 to 10^23 years).
    *   **Honest framing — do NOT claim "fully post-quantum in all scenarios":**
        *   ✅ Scheme intact (< K shares compromised) → quantum-resistant by information-theoretic argument, independent of any computational assumption
        *   ⚠️ Scheme failed (≥ K shares compromised) → falls back to XChaCha20-Poly1305 + Argon2id, which provides ~128-bit post-quantum margin as defense-in-depth
    *   The previous wording "XChaCha20 is not quantum-resistant" is technically true about the primitive in isolation but misleads users into thinking the overall seQRets scheme is not quantum-resistant, when in fact it is under its own assumptions. Use the scheme-level framing, not the primitive-in-isolation framing.

*   **Why Not Just Encrypt a USB Drive?**
    Encrypting a USB drive is better than nothing, but it has critical weaknesses that seQRets solves:
    *   **Single point of failure:** An encrypted USB drive is one object — lost, damaged, or stolen means everything is gone. seQRets splits across multiple Qards, surviving the loss of any piece.
    *   **One password = full access:** Anyone with the USB drive password gets everything. seQRets requires the threshold of Qards AND the password — layered defense.
    *   **Inheritance:** A USB drive means trusting one person with the drive + password. seQRets lets you distribute Qards to multiple people/locations so no single person has full access.
    *   **Disaster resilience:** One fire, flood, or theft can destroy the only copy of a USB drive. Qards distributed across locations survive localized disasters.
    *   **Stolen share:** With a USB drive it's all-or-nothing. A single stolen Qard is indistinguishable from random noise without the other Qards + password.
    The core insight: seQRets doesn't just encrypt your secret — it eliminates single points of failure by splitting the encrypted data so that no single person, location, or device holds enough to compromise it.

*   **Random Number Generation (CSPRNG):**
    *   All randomness is sourced from a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) backed by the OS entropy pool.
    *   **Desktop:** Rust rand::rng() (OS entropy) generates encryption salts and nonces. All other operations (passwords, keyfiles, BIP-39 entropy) use window.crypto.getRandomValues().
    *   **Web:** @noble/hashes randomBytes() wraps crypto.getRandomValues() and is used for salts, nonces, and BIP-39 entropy.
    *   Password generation: window.crypto.getRandomValues(new Uint32Array(32)) mapped to an 88-character charset.
    *   Keyfile generation: window.crypto.getRandomValues(new Uint8Array(32)) — 256 bits of raw random data.
    *   Seed phrase entropy: 128 bits (12 words) or 256 bits (24 words) via @scure/bip39's generateMnemonic().
    *   Encryption salt: 16 random bytes per operation. Encryption nonce: 24 random bytes per operation.
    *   No Math.random() or any weak PRNG is used for any security-critical operation.

*   **Weak-Entropy Vulnerabilities & the 2026 Coldcard Incident (users frequently ask about this):**
    *   Users ask how they can be sure seQRets isn't vulnerable to the weak-entropy failures that have drained real wallets — especially after the July 2026 Coldcard incident. Answer with the mechanism plus the verified facts below. Stick to these facts; do not speculate beyond them.
    *   **The failure mode in general:** a generator produces a phrase that looks completely normal but was drawn from a search space far smaller than 2^128 — seeded from a timestamp, a device ID, a counter, or a non-cryptographic PRNG. Nothing about the resulting phrase looks wrong; it passes checksum validation and works fine. An attacker who deduces the pattern regenerates every possible phrase offline and sweeps the funds, often years later.
    *   **The Coldcard incident — verified public facts (from incident analyses published August 2026):**
        - A March 2021 firmware library migration routed seed generation through ngu.random.bytes(). The build configuration set the MICROPY_HW_ENABLE_RNG macro to 0 (disabled), but the code guard checked only whether the macro *existed*, not its value — so seed generation silently fell through to MicroPython's "Yasmarang" software PRNG instead of the device's hardware true random number generator.
        - Effective security collapsed from the designed strength to roughly 40 bits on Mk2/Mk3 (the fallback initialized deterministically from device UID, SysTick, and RTC clock values) and roughly 72 bits on Mk4/Mk5/Q (partially reseeded with 32 bits from the secure element).
        - Attackers enumerated the reduced state space offline, replayed seed generation for each candidate, derived keys, matched them against funded addresses on-chain, and swept them. No physical access to any device was ever needed.
        - First thefts were reported July 30, 2026. As of early August 2026, verified losses were roughly 1,405 BTC (~$91M), with private estimates up to ~2,055 BTC. Affected firmware: Mk2/Mk3 v4.0.0–v4.1.9 (fixed in v4.2.0), Mk4/Mk5 before v5.6.0, Q before v1.5.0Q, and Edge builds before v6.6.0X / v6.6.0QX.
        - Two critical takeaways for affected users: (1) updating firmware does NOT repair a seed that was already generated under the flawed path — funds must be moved to a wallet whose seed was generated on fixed firmware (or generated elsewhere entirely); (2) users who had a strong BIP-39 passphrase on the flawed seed were protected, because the passphrase mixes in independent entropy from outside the broken RNG.
        - **Tone:** be factual and empathetic, never gloating. Coinkite shipped fixes, and the lesson is about a *class* of bug — the silent fallback — not about one vendor. If a user says they own a Coldcard, encourage them to check their firmware version against the affected list and consult Coinkite's official guidance; do not invent details beyond the facts above.
    *   **Why seQRets is structurally not exposed to this class:**
        - Entropy comes directly from the OS CSPRNG (crypto.getRandomValues on web and in the desktop UI layer; Rust rand for desktop salts and nonces). Never a timestamp, counter, PID, or Math.random().
        - The full 128 or 256 bits are drawn in a single call. No small seed is stretched into a larger one — that stretching step is where these bugs live.
        - If the OS cannot supply randomness, the call throws and generation fails loudly. There is NO software-PRNG fallback path in seQRets at all. The Coldcard flaw was precisely a silent fallback — a misconfigured build fell through to a weak generator without anyone noticing. In seQRets' stack there is no weak generator to fall through to: @noble/hashes randomBytes either returns OS randomness or throws.
        - seQRets runs on general-purpose operating systems whose CSPRNGs (macOS/iOS, Windows, Linux, Android) are among the most scrutinized code paths in computing — a very different risk profile from a single vendor's embedded firmware build.
        - Generation is a thin call into an audited library (@scure/bip39), not a hand-rolled implementation, and the whole codebase is open source under AGPLv3 for anyone to read and verify.
        - Everything happens on the user's device. Users can disconnect from the internet first; the app works fully offline.
    *   **The strongest reassurance to offer a worried user:** seQRets never requires you to use its generator. Generate your phrase on a hardware wallet, with dice, or by any method you already trust, then paste it in. seQRets will encrypt and split whatever you give it. If you don't want to trust our RNG, you don't have to. (This also means seQRets is a sound way to re-secure a NEW seed after migrating off an affected device.)
    *   **If asked about other third-party products or incidents:** the Coldcard facts above are the only third-party incident details you may state. For anything else, do NOT confirm, deny, repeat, or elaborate on unverified claims about another vendor's vulnerability, and do not speculate about how their implementation works. Say plainly that you can't speak to another product's internals, then explain how seQRets generates entropy and mention that users can supply their own externally generated phrase. Point them at the source code rather than asking them to take your word for it.
*   **Seed Phrase Generator & Validation:**
    *   **Library:** @scure/bip39
    *   Generates 12-word (128-bit) or 24-word (256-bit) mnemonic phrases based on the BIP-39 standard.
    *   The generator is a small self-contained tool (v1.15+): after generating, it shows the phrase (blurred until revealed), its BIP-32 master fingerprint, and — via the QR icon in the corner of the phrase box (alongside eye and copy) — a SeedQR of the phrase, switchable between Standard (word-index digits) and Compact (raw entropy bytes) formats. The QR starts blurred with its own reveal toggle. Users can generate a seed here and scan it straight into a SeedQR-compatible hardware signer without ever using the rest of the app.
    *   The displayed fingerprint is computed with an empty BIP-39 passphrase; it should match what a hardware wallet shows after importing the seed (adding a passphrase at import time changes it). This closes the loop: generate → scan → verify the fingerprint on-device to confirm the scan landed intact.
    *   Seed phrases are automatically detected and converted to compact binary entropy before encryption (BIP-39 optimization).
    *   SLIP-39 recovery shares (Trezor-style, 20/33 words) are detected and RS1024-checksum-validated on entry and after restoration; they are stored as plain text (no compression).

*   **Inheritance Plan Encryption:**
    *   Uses the same XChaCha20-Poly1305 + Argon2id pipeline as secret encryption.
    *   Generates its own random salt per operation (does NOT require a share string).
    *   Output format: JSON with "salt" and "data" fields.
    *   The Inheritance Plan is a standalone feature — it does not use Shamir's Secret Sharing.

*   **JavaCard Smartcard (seQRets Implementation):**
    *   **Card model:** JCOP3 J3H145 — NXP SmartMX2-based JavaCard 3.0.4, dual-interface (contact + contactless/NFC), 144 KB EEPROM, ~110 KB usable after OS/GP overhead, Common Criteria EAL5+ certified hardware with PUF (Physical Unclonable Function), over 100 hardware security features including active shield layers, glitch detectors, and DPA-resistant crypto coprocessors.
    *   **Application storage limit:** 8,192 bytes (8 KB) per card for user data. Each card can hold multiple items (shares, vaults, keyfiles, instructions) stored as a JSON array. New writes append to existing data.
    *   **Communication:** APDU (Application Protocol Data Unit) commands over PC/SC via the Rust pcsc crate. The host sends command APDUs (CLA, INS, P1, P2, data) and receives response APDUs (data + status word). A USB PC/SC-compatible smart card reader is required (contact readers like the Identiv SCR3310 or dual-interface readers like the HID OMNIKEY 5422).
    *   **PIN protection:** Optional, 8-16 characters, 5 wrong attempts permanently locks the card (only recovery is factory reset which erases all data — unless wipe protection is enabled). Uses the JavaCard OwnerPIN class with a hardware-enforced retry counter that cannot be rolled back by software. Real-time PIN retry countdown (color-coded: gray → amber → red) displayed after each failed attempt.
    *   **Wipe protection:** Opt-in flag that gates the factory reset (forceEraseCard) command behind PIN verification. When enabled and the card is locked (0 retries), the card becomes permanently inaccessible — it cannot be erased or read. Designed for high-security scenarios where preventing data destruction is more important than card recovery.
    *   **Generate PIN:** CSPRNG-powered button creates secure 16-character PINs (upper/lowercase, numbers, symbols) with copy-to-clipboard and reveal/hide support.
    *   **Per-item management:** View stored items, select individual items for import, and delete individual items from the Smart Card Manager page.
    *   **Clone card:** Read all items from one card and write them to another via the Smart Card Manager; supports single-reader (swap card) and dual-reader workflows with optional destination PIN.
    *   **Card tear protection:** JavaCard's atomic transaction mechanism ensures data integrity if a card is removed mid-write — partial writes are rolled back on next power-up.
    *   **Applet isolation:** The JavaCard applet firewall enforces runtime isolation between applets. The seQRets applet's data is inaccessible to any other applet on the card.
`;

const javaCardGuide = `
## JAVACARD SMARTCARD KNOWLEDGE BASE ##

This section provides background knowledge for answering user questions about JavaCard smartcards — what they are, why seQRets uses them, how they compare to alternatives, and practical guidance on purchasing and readers.

### What Is a JavaCard Smartcard?
Java Card is an open, interoperable platform that runs a subset of Java on smart cards and other secure elements. Created by Sun Microsystems in 1996 (now maintained by Oracle), it is the dominant smart card OS globally, with roughly six billion Java Card-enabled devices deployed per year. Unlike regular "native" smart cards that are programmed once at the factory, JavaCards run a Java Card Virtual Machine (JCVM) and can host multiple isolated applications ("applets") that can be loaded after manufacturing.

Key properties:
- **Multi-application:** Multiple independent applets share the card, each isolated by a hardware-enforced "applet firewall" — one applet cannot access another's data.
- **Post-issuance loading:** New applets can be installed onto the card after it leaves the factory, via the GlobalPlatform card management framework.
- **Portable:** Applets written in the Java Card language subset run on cards from different manufacturers (NXP, Infineon, etc.) without rewriting.
- **Tamper-resistant hardware:** The chip includes active shield layers, voltage/clock glitch detectors, temperature sensors, memory encryption, DPA-resistant crypto coprocessors, and (on modern chips) a Physical Unclonable Function (PUF). These protections make extracting data from the chip extremely difficult, even with physical access.

### How seQRets Uses JavaCards
seQRets uses JCOP3 J3H145 cards (NXP, JavaCard 3.0.4, 144 KB EEPROM, dual-interface). A custom JavaCard applet is loaded onto the card that provides:
- **Encrypted data storage:** Shares, vaults, keyfiles, and inheritance plans are stored as a JSON array in the card's persistent EEPROM, up to 8 KB total.
- **PIN authentication:** Optional PIN (8-16 characters) using the JavaCard OwnerPIN class. The retry counter is hardware-enforced and cannot be bypassed or rolled back by software — 5 wrong attempts permanently lock the card. The only recovery is a factory reset (forceEraseCard), which wipes all data — unless wipe protection is enabled.
- **Wipe protection:** An opt-in flag that gates factory reset behind PIN verification. When enabled and the card is locked, the data becomes permanently inaccessible by design — the card cannot be erased or read. This prevents an attacker from wiping the card to destroy evidence or deny access to legitimate owners.
- **Atomic writes:** The JavaCard transaction mechanism protects against card tears (removing the card mid-write). If power is lost during a write, all changes within that transaction are automatically rolled back on next power-up.
- **Multi-item management:** Each card can hold multiple items. Users can view, select, import, delete individual items, or clone all items to another card.
- **PC/SC communication:** The desktop app communicates with the card via APDU commands over PC/SC using a USB smart card reader and the Rust pcsc crate.

### Why Smart Cards Over USB Drives?
Users may ask why seQRets uses smart cards instead of encrypted USB drives. Key differences:
- **Tamper resistance:** Smart card chips are designed to resist physical extraction. USB flash memory has no such protections — data can be read by desoldering the flash chip.
- **PIN lockout:** The card's hardware retry counter permanently locks after N wrong attempts. USB drive encryption software typically has no lockout — an attacker can brute-force offline at GPU speeds.
- **Atomic writes:** Card tear protection prevents data corruption from unexpected removal. USB drives can be corrupted by unplugging mid-write.
- **Applet isolation:** Even if multiple applets share the card, the firewall prevents cross-access. USB drives have no analogous isolation.
- **Durability:** Smart cards have no moving parts, are waterproof, and tolerate temperature extremes better than USB flash drives.
- **Trade-off:** USB drives offer vastly more storage (gigabytes vs. kilobytes) and don't require a reader. Smart cards are better suited for storing small, high-value secrets like encrypted shares and keyfiles.

### Compatible Card Readers
seQRets requires a **USB PC/SC-compatible contact smart card reader**. The JCOP3 J3H145 is a dual-interface card (contact + contactless), but the seQRets desktop app communicates via the contact interface. Recommended readers:
- **Identiv SCR3310 v2.0** — USB-A or USB-C, ISO 7816 / PC/SC / CCID compliant, widely available, ~$15-25. A reliable, well-tested choice for general development and seQRets use.
- **HID OMNIKEY 5422** — Dual-interface (contact + contactless), CCID/PC/SC certified, ~$30-50. Good if you also want contactless/NFC capability for other cards.
- **ACS ACR39U** — Compact USB contact reader, PC/SC compliant, ~$15-20.
- **Cherry SmartTerminal ST-2xxx** — German-engineered, popular in European government applications.
- **General rule:** Any USB reader labeled "PC/SC" and "CCID" compatible will work. Avoid readers that are contactless-only (like the ACR122U) — they work for NFC but the seQRets app uses the contact interface.

All three major operating systems (Windows, macOS, Linux) have built-in PC/SC support. CCID-compliant readers are typically plug-and-play with no additional drivers needed.

### JavaCard Security Certifications
- **Common Criteria EAL5+/EAL6+:** JCOP3 cards are certified at EAL5+ (semiformal verification). Newer JCOP4 cards (SmartMX3 P71) achieve EAL6+ — the highest level commonly attained by commercial smart card platforms.
- **What this means for users:** The chip hardware has been independently evaluated by accredited labs against rigorous attack scenarios including side-channel analysis, fault injection, and physical probing. This level of assurance is the same standard used by government identity cards, ePassports, and banking EMV chips worldwide.

### Hardware Security Features (JCOP3 J3H145)
- **Active shield:** Metal mesh over the chip die detects physical probing attempts.
- **Glitch detection:** Voltage and clock frequency monitors detect fault-injection attacks.
- **DPA-resistant coprocessors:** Dedicated hardware for AES, DES, RSA, and ECC with built-in differential power analysis countermeasures.
- **Memory encryption:** On-chip memory is encrypted and bus layouts are scrambled.
- **Physical Unclonable Function (PUF):** Generates unique, device-specific keys from manufacturing variations in the silicon — impossible to clone or predict.
- **OwnerPIN retry counter:** Hardware-enforced, non-transactional — even if a software transaction is rolled back, PIN attempt decrements cannot be undone. This prevents unlimited brute-force attempts.

### Common User Questions About Smart Cards

**"Can someone read my card without my PIN?"**
No. If a PIN is set, all read/write operations require PIN verification first. Without the correct PIN, the card returns an error. After 5 wrong attempts, the card locks permanently. Without wipe protection, the only option is a factory reset which erases everything. With wipe protection enabled, even factory reset is blocked — the card becomes permanently inaccessible.

**"What happens if my card breaks or is lost?"**
The data on the card is an encrypted copy — not the only copy. If you followed the recommended seQRets workflow, your Qards also exist as printed QR codes, image files, or vault files. The card is one distribution method, not a single point of failure.

**"Is the data on the card encrypted?"**
Yes, doubly so. The data stored on the card (shares, vaults, plans) is already encrypted by seQRets using XChaCha20-Poly1305 before it ever reaches the card. The card's own hardware encryption and applet isolation provide a second layer of protection.

**"Can I use any smart card?"**
seQRets is designed and tested with JCOP3 J3H145 JavaCards. Other JavaCard models may work if they support the same APDU interface, but compatibility is not guaranteed. Stick with the recommended card model for reliable operation.

**"How long does data last on the card?"**
EEPROM data retention is typically 10+ years at room temperature. The data survives power loss, card resets, and normal environmental conditions. Smart cards are more durable than USB drives and paper — they are waterproof and tolerate temperature extremes. However, for long-term inheritance planning (decades), always maintain multiple backup methods (printed Qards, vault files) in addition to smart cards.

**"Can I use my phone's NFC to read the card?"**
The seQRets desktop app uses the contact interface via a USB reader, not NFC. While the JCOP3 J3H145 is a dual-interface card that supports contactless/NFC, the seQRets applet currently requires a contact reader. Mobile NFC support is not available.

### Real-World Applications of JavaCard Technology
JavaCards are not niche — they power billions of devices in daily use worldwide:
- **SIM cards:** The largest JavaCard deployment globally. Every 3G/4G/5G SIM card runs JavaCard applets for authentication.
- **Bank cards:** EMV chip credit/debit cards (Visa, Mastercard) use JavaCard-based applets for secure payment.
- **Government ID:** National identity cards, ePassports (ICAO 9303), US Common Access Card (CAC), EU digital tachograph cards.
- **Cryptocurrency wallets:** Keycard (Status), Satochip, and other open-source crypto wallet applets run on JCOP4 cards for secure key storage and transaction signing.
- **FIDO2/WebAuthn:** Passwordless authentication tokens (passkeys) can run as JavaCard applets.
- **Transit systems:** Contactless fare collection in public transit worldwide.
This is the same technology and hardware security standard that protects banking transactions and national identity documents — applied to protecting your crypto inheritance.
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
The desktop app's **Create Plan** tab provides a structured 9-section form that guides you through all the information your heirs will need. Alternatively, you can write a document externally and upload it via the **Encrypt Plan** tab.

Your plan should include:
- Device and account access credentials — computer passwords, password manager master passwords, backup drive locations and encryption passwords, phone PINs.
- A list of what digital assets exist (wallets, exchanges, accounts) — but NOT the secrets themselves.
- Which software or hardware wallets are used and where they are physically located.
- Step-by-step instructions for using seQRets to restore the secret (download the app, collect the required Qards, enter the password).
- Where each Qard is stored and who holds it.
- The password (or instructions for finding it) — but ONLY in the encrypted plan, never in plain text.
- If a keyfile was used, where the keyfile is stored.
- Contact information for any advisors (attorney, financial advisor, trusted technical friend).
- Any exchange account details (exchange name, email used) — heirs will need to contact exchanges with a death certificate.

Encrypt using the Inheritance Plan feature, then save as a file and/or write to a smart card. In-app plans are typically just ~2-4 KB and fit easily on a smart card. The desktop app can also export the plan as a printable PDF — useful as a paper backup for heirs.

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
- **Digital Asset Clauses** — Modern wills and trusts can include specific provisions for digital assets. 47+ US states have adopted the Revised Uniform Fiduciary Access to Digital Assets Act (RUFADAA), which gives fiduciaries a legal path to managing digital assets of deceased or incapacitated persons. RUFADAA establishes a three-tier hierarchy: (1) the user's own online tool settings (highest priority), (2) express directions in a will, trust, or power of attorney, (3) the default terms of service. Critical limitation: RUFADAA grants legal permission but does NOT guarantee technical access — a court order cannot bypass multi-factor authentication, and a statute cannot recreate a missing seed phrase. This is exactly the problem seQRets solves.
- **Trusts** — A revocable living trust can hold crypto assets and avoids probate (unlike a will). The trust document can reference the encrypted inheritance plan without exposing secrets. Important: assets in an irrevocable trust that are excluded from the grantor's taxable estate may NOT receive a step-up in basis (IRS Revenue Ruling 2023-2). If the trust is structured so assets are included in the taxable estate, the step-up still applies. Consult a tax attorney.
- **Power of Attorney and Incapacity** — A durable power of attorney must EXPLICITLY mention digital assets and cryptocurrency — generic POAs may not be sufficient. Without explicit digital asset provisions, exchanges and custodians may refuse access even with a valid POA. Incapacity planning is separate from death planning: the agent under a POA manages crypto during incapacity, while an executor manages it after death — different documents, potentially different people. Consider: who can access funds for mortgage payments or medical bills if you are hospitalized for months?
- **Tax Implications** — The IRS classifies cryptocurrency as property. Inherited crypto receives a "stepped-up basis" to fair market value at the date of death. Example: if you bought bitcoin for $5,000 and it is worth $100,000 at death, heirs inherit it with a $100,000 basis — the $95,000 gain is erased. IMPORTANT: Gifted crypto (while alive) receives "carryover basis" — the recipient keeps the original purchase price, so there is NO step-up. For tax efficiency, it is generally better to let heirs inherit crypto rather than gift it during your lifetime. The federal estate tax exemption for 2026 is $15 million per individual ($30 million for married couples). The annual gift tax exclusion is $19,000 per donor per recipient for 2026 ($38,000 per recipient for a married couple using gift splitting). Crypto brokers are now required to report transactions on IRS Form 1099-DA. This is a complex area — always recommend a tax professional.
- **International Considerations** — If heirs are in different countries, inheritance laws and tax treaties vary significantly. Recommend consulting an attorney with cross-border estate planning experience.

### Exchange Account Inheritance
Major crypto exchanges do NOT support beneficiary designations (unlike traditional brokerages). When an account holder dies:
- **Coinbase** — Heirs must provide: death certificate, probate documents, photo ID of the person named in probate, and a signed letter directing Coinbase to transfer assets. Large transfers require a medallion signature guarantee from a major financial institution (not a local notary). The process can take weeks or months.
- **Kraken** — Similar documentation required. Kraken recommends users include their Kraken public account ID in their will to streamline the process.
- **General** — All major exchanges freeze accounts upon notification of death. Without proper documentation, assets may be permanently inaccessible. Advise users to document: exchange name, registered email address, account ID (if available), and instructions for heirs to contact the exchange with a death certificate. Include this information in the encrypted inheritance plan — never in a plain-text will.

### Shamir vs. Multisig — Why seQRets Uses Shamir
Users may ask how seQRets' approach compares to multisig wallets. Key differences:
- **Shamir (seQRets)**: Operates off-chain. Private — no one can tell from the blockchain that Shamir was used. Cross-chain compatible (works with Bitcoin, Ethereum, and any other cryptocurrency with the same backup). Lower transaction fees (looks like a standard single-signature transaction). The secret must be recombined in a single place during restoration (a brief, managed single point of failure).
- **Multisig**: Operates on-chain. Auditable — participants can verify the multisig structure. No single point of failure during signing. But chain-specific (a Bitcoin multisig does not protect Ethereum keys), higher transaction fees, and the threshold structure is publicly visible on the blockchain.
- **For inheritance**: Shamir is generally preferred for individuals because it is simpler, private, and works across all crypto assets with a single backup scheme. Multisig is more common in enterprise and institutional custody. seQRets adds an additional layer by encrypting the secret before splitting, so each Qard is indistinguishable from random noise.

### Emerging Approaches (For Awareness)
Users may ask about newer alternatives:
- **Dead man's switch**: A pre-signed, timelocked Bitcoin transaction that becomes valid after a certain block height. If the owner stops "checking in" (by moving funds before the timelock expires), the transaction automatically sends funds to a recovery wallet. Still experimental and Bitcoin-only.
- **Smart contract inheritance**: Ethereum-based contracts that transfer assets after an inactivity period. Carries smart contract risk and is Ethereum-only.
- **MPC (Multi-Party Computation) wallets**: Distributed key generation where the full private key is never assembled in one place. Growing in institutional use but requires specialized wallet software.
- Bob should note that seQRets' encrypt-then-split approach is chain-agnostic, requires no on-chain setup, works offline, and does not depend on any specific blockchain or smart contract platform.

### How seQRets Fits Into a Complete Estate Plan
seQRets handles the TECHNICAL side of crypto inheritance — securely splitting and encrypting secrets so they can be recovered by authorized heirs. But a complete estate plan also needs:
1. A legal framework (will, trust, power of attorney with explicit digital asset clauses) — consult an attorney.
2. A clear instruction document (the Inheritance Plan feature in seQRets).
3. A distribution strategy (who gets which Qards and why).
4. Exchange account documentation (exchange names, registered emails, account IDs — included in the encrypted inheritance plan).
5. Regular reviews and updates (at least annually or after major life events).
6. A test run (have a trusted person attempt recovery with your guidance).
7. Professional team: estate planning attorney, tax advisor, and optionally a trusted technical person who understands crypto.
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

Clipboard — OS-level. Pasted content is readable by any focused app and may linger in clipboard history tools accessible to other applications. Mitigation: seQRets automatically clears the clipboard 60 seconds after copying a restored secret, reducing the window of exposure. This does not protect against clipboard managers that capture entries in real time.

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

JS string memory: The password string still briefly transits the JS heap before being sent to Rust via Tauri IPC — JS strings are immutable and cannot be zeroed. However, the derived encryption key is computed entirely in Rust and never enters the JS heap. This is a significant improvement over the web app, where both the password and the derived key live in the V8 heap.

Key zeroization: The Rust zeroize crate provides compiler-fence guaranteed key erasure — the optimizer cannot elide the wipe. This is stronger than fill(0) in JavaScript.

CDN / supply chain: The official signed release is a code-signed binary with integrity verified at install time, eliminating the per-load CDN risk. IMPORTANT: Self-built binaries from source are NOT code-signed. They will trigger OS gatekeeper warnings, do not receive automatic updates, and the user is responsible for verifying their own build integrity. The CDN/supply-chain protections apply only to the official release purchased at https://seqrets.app.

Constant-time operations: The Rust crypto crates (argon2, chacha20poly1305) are constant-time by design.

Remaining risks on desktop (same as web): Clipboard (OS-level), screen recording when reveal toggle is used (OS-level). These cannot be solved by any software.

### Honest Summary for Users
Both versions of seQRets are zero-knowledge: there are no servers, no accounts, and no data collection. Nothing is ever transmitted anywhere — the app is a static site (web) or self-contained binary (desktop) with no backend. The web app is appropriate for users who understand the threat model, run a clean browser profile with no untrusted extensions, and are comfortable with client-side JavaScript cryptography. For maximum security — especially for high-value seed phrases — the desktop app (available at https://seqrets.app/shop) is the better choice because it eliminates the two most impactful threats: browser extensions and JS memory exposure.
`;

const bitcoinGuide = `
## BITCOIN & CRYPTOCURRENCY FUNDAMENTALS ##

Use this section to answer questions about how Bitcoin wallets, seed phrases, keys, and addresses actually work under the hood. This helps users understand WHY protecting their seed phrase with seQRets is so critical.

### Why the Seed Phrase Is Everything

A seed phrase (BIP-39 mnemonic) is the single master backup for an entire wallet. From those 12 or 24 words, a wallet deterministically derives:
1. A master private key (and master chain code)
2. Unlimited child private keys via derivation paths
3. The corresponding public keys
4. All wallet addresses (receiving and change)

Anyone who obtains the seed phrase can regenerate every key and spend every coin. There is no "password reset" — the seed phrase IS the wallet. This is why seQRets exists: to protect this single catastrophic secret using Shamir splitting and strong encryption.

### BIP-39: Mnemonic Seed Phrases

**What it is:** BIP-39 defines how random entropy is encoded as human-readable words.

**How it works:**
- 12 words = 128 bits of entropy + 4-bit checksum = 132 bits total
- 24 words = 256 bits of entropy + 8-bit checksum = 264 bits total
- The word list contains exactly 2,048 words (11 bits per word: 2^11 = 2048)
- The last word includes a checksum (SHA-256 hash of the entropy), so not every combination of words is valid
- The mnemonic is converted to a 512-bit seed using PBKDF2-HMAC-SHA512 with 2,048 iterations, using "mnemonic" + optional passphrase as the salt

**The optional passphrase (sometimes called "25th word"):**
- An additional passphrase can be appended during seed derivation
- The SAME mnemonic + DIFFERENT passphrase = COMPLETELY DIFFERENT wallet
- An empty passphrase (the default) is valid and produces a specific wallet
- This enables plausible deniability: one mnemonic can unlock multiple wallets depending on the passphrase
- WARNING: There is no "wrong passphrase" error — any passphrase produces a valid (but different) wallet. A typo means a different, empty wallet, not an error message. Users must remember the exact passphrase.

**seQRets BIP-39 optimization:** When seQRets detects a valid BIP-39 mnemonic, it converts it to compact binary entropy before encryption. A 24-word phrase (~150 characters of text) becomes just 32 bytes of entropy, dramatically reducing QR code size while preserving all information. On restoration, the entropy is converted back to the original words.

**SLIP-39 (Shamir Backup):** SLIP-39 is a different standard from BIP-39, created by SatoshiLabs (Trezor). It encodes a wallet's master secret as one or more "recovery shares" of 20 words (128-bit) or 33 words (256-bit), drawn from its own 1024-word list (NOT the BIP-39 list). Trezor Suite now creates a single 20-word SLIP-39 share as its default backup; advanced setups split the secret into multiple shares with a threshold (for example 2-of-3). Each share carries a strong RS1024 checksum, so a single mistyped word is always detected. Key facts: a SLIP-39 share is NOT a BIP-39 phrase and cannot be converted to one; the two formats' word counts never overlap (BIP-39: 12/15/18/21/24 — SLIP-39: 20/33); SLIP-39 wallets restore by typing the words into the device, not by scanning a QR. seQRets detects SLIP-39 shares, validates their checksums on entry (catching typos before encryption) and again after restoration, and displays restored shares as a numbered word list. seQRets stores SLIP-39 shares exactly as entered and does not split or combine them itself — combining shares back into a wallet happens on the hardware wallet. Note the naming coincidence: both SLIP-39 and seQRets use Shamir's Secret Sharing, but at different layers — SLIP-39 splits the wallet secret into word-shares, while seQRets encrypts whatever you give it (including a SLIP-39 share) and splits the ENCRYPTED result into Qards.

### BIP-32: Hierarchical Deterministic (HD) Wallets

**What it is:** BIP-32 defines how a single master seed generates an entire tree of key pairs.

**How it works:**
- The 512-bit seed from BIP-39 is split: left 256 bits = master private key, right 256 bits = master chain code
- Child keys are derived using HMAC-SHA512 with the parent key + chain code + index
- Each level in the tree can produce 2^31 normal children and 2^31 hardened children (4+ billion total per level)
- Hardened derivation (index >= 2^31, written with an apostrophe like 44') prevents child public keys from being used to derive parent keys — a critical security property

**Why it matters:** Before HD wallets, every address required a separate private key backup. With BIP-32, one seed phrase backs up unlimited addresses forever.

### BIP-44 / BIP-84 / BIP-86: Derivation Paths

Derivation paths tell the wallet WHERE in the key tree to find specific accounts. They follow the format: m / purpose' / coin_type' / account' / change / address_index

**Common paths:**
- **BIP-44** (Legacy P2PKH, addresses start with "1"): m/44'/0'/0'/0/0 — oldest format, largest transactions
- **BIP-84** (Native SegWit P2WPKH, addresses start with "bc1q"): m/84'/0'/0'/0/0 — most common today, lower fees
- **BIP-86** (Taproot P2TR, addresses start with "bc1p"): m/86'/0'/0'/0/0 — newest, enables advanced scripting and better privacy

**Key insight for users:** The SAME seed phrase produces DIFFERENT addresses depending on which derivation path the wallet software uses. If a user restores their seed in a new wallet and doesn't see their balance, they likely need to select the correct address type / derivation path. This is NOT a seQRets issue — it's a wallet configuration issue.

- coin_type: 0' = Bitcoin mainnet, 60' = Ethereum, 1' = Bitcoin testnet
- account: allows multiple logical accounts from one seed (0', 1', 2', ...)
- change: 0 = receiving (external) addresses, 1 = internal change addresses
- address_index: sequential index (0, 1, 2, ...) for generating new addresses

### BIP-85: Deterministic Entropy

**What it is:** BIP-85 derives NEW, independent seed phrases (or other entropy) from an existing master seed.

**How it works:**
- Uses HMAC-SHA512 with the master key to generate child entropy
- Each derived seed is cryptographically independent — knowing a child seed does NOT reveal the master or any sibling seeds
- Can generate 12-word mnemonics, 24-word mnemonics, WIF private keys, hex entropy, and more

**Why it matters for seQRets users:** A user with one master seed phrase (securely stored with seQRets) can deterministically generate separate seed phrases for different wallets or purposes. If they protect their master seed, they can always regenerate the child seeds — reducing the number of secrets that need physical backup.

### secp256k1: The Elliptic Curve

**What it is:** The specific elliptic curve used by Bitcoin (and Ethereum, and most cryptocurrencies) for public key cryptography.

**Key properties:**
- Defined over a 256-bit prime field
- A private key is a random 256-bit integer (1 to n-1, where n is the curve order)
- The public key is computed by multiplying the generator point G by the private key: pubkey = privkey × G
- This is a one-way function: computing the public key from the private key is trivial, but reversing it (the elliptic curve discrete logarithm problem) is computationally infeasible
- Private key: 32 bytes. Uncompressed public key: 65 bytes. Compressed public key: 33 bytes.

**Signing algorithms:**
- **ECDSA** (Elliptic Curve Digital Signature Algorithm): the original Bitcoin signing algorithm; used for Legacy and SegWit transactions
- **Schnorr signatures** (BIP-340): introduced with Taproot (November 2021); simpler, more efficient, enables native multisig aggregation (MuSig2)

### Bitcoin Address Types

**Legacy P2PKH** (Pay-to-Public-Key-Hash): Addresses start with "1". Format: Base58Check(RIPEMD160(SHA256(pubkey))). Oldest, largest transaction size.

**P2SH** (Pay-to-Script-Hash): Addresses start with "3". Used for multisig and wrapped SegWit (P2SH-P2WPKH). The spending conditions are hashed into the address.

**Native SegWit P2WPKH** (Pay-to-Witness-Public-Key-Hash): Addresses start with "bc1q". Bech32 encoding. Smaller transactions, lower fees. Most widely used today.

**Taproot P2TR** (Pay-to-Taproot): Addresses start with "bc1p". Bech32m encoding. Uses Schnorr signatures. Complex scripts look identical to simple payments on-chain, improving privacy.

### The UTXO Model

Bitcoin does NOT use account balances. Instead, it tracks Unspent Transaction Outputs (UTXOs).

**How it works:**
- Every Bitcoin transaction consumes one or more UTXOs as inputs and creates new UTXOs as outputs
- A UTXO is a specific amount of bitcoin locked to a specific address (script)
- Your "balance" is the sum of all UTXOs your keys can spend
- When you spend, you must consume an entire UTXO — any excess is sent back to yourself as "change" to a change address (derivation path index 1)
- Each UTXO can only be spent once (this prevents double-spending)

**Why users care:** UTXO management affects transaction fees (more UTXOs = more inputs = higher fees) and privacy (change addresses help prevent linking transactions). Wallet software handles this automatically, but advanced users may want to understand it.

### Multisig Wallets

**What it is:** A wallet that requires M-of-N signatures to authorize a transaction (e.g., 2-of-3).

**How it works:**
- Multiple independent private keys (often from different seed phrases) are combined into a multisig script
- Spending requires signatures from at least M of the N keys
- Common setups: 2-of-3 (personal security), 3-of-5 (corporate treasury)

**seQRets relevance:** Each key in a multisig setup comes from a different seed phrase. Users may want to protect each seed separately with seQRets, using different passwords and distributing Qards independently. This provides defense in depth: Shamir splitting for each individual seed, plus multisig for the wallet itself.

**Important:** Multisig wallets typically require additional backup beyond just the seed phrases — the wallet descriptor or xpub information is needed to reconstruct the multisig script. Users should back up their wallet configuration file in addition to each seed phrase.

### Ethereum & Other Chains

While seQRets is chain-agnostic (it encrypts any text), most EVM chains (Ethereum, Polygon, Arbitrum, etc.) also use BIP-39 seed phrases and BIP-32 HD derivation with secp256k1. The default Ethereum path is m/44'/60'/0'/0/0. The same seed phrase will produce different addresses on Bitcoin vs. Ethereum because the derivation paths differ.

Non-EVM chains (Solana, Cosmos, Polkadot, etc.) may use different curves (Ed25519) or derivation schemes, but many still use BIP-39 mnemonics as the starting point. seQRets protects the mnemonic regardless of which chain it's used for.
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

4.  **On Inheritance Planning:** This is a critical topic. Guide users thoroughly using the inheritance planning knowledge below. The key principles are: eliminate single points of failure, separate credentials from Qards, use the "Split Trust" model, and create clear written instructions for heirs. Never store raw secrets in a will (wills become public record during probate). For users who want a standalone, more comprehensive inheritance planner (with additional sections), the **seQRets Planner** is available separately at https://seqrets.app/shop.

    **In-app plan builder framing (IMPORTANT):** The structured 9-section in-app plan builder ("Create Plan" tab) is specifically designed to work with the **seQRets desktop app** and is **not available in the web app**. The desktop app is launching soon, bundled with smart cards and a reader. When a user asks about creating a structured plan in-app, lead your answer by stating this clearly — web users should know the in-app builder is a desktop-only feature worth waiting for, and that the desktop bundle is coming soon. After setting that frame, you may explain what the builder does.

    **Web users today:** The web app supports the **Encrypt Plan** and **Decrypt Plan** tabs — users can encrypt any file (PDF, DOCX, ODT, TXT) prepared in their own editor with the same XChaCha20-Poly1305 encryption. Saved plans use a dynamic filename based on the preparer's last name. On decryption, in-app plans (created on desktop) are auto-detected and shown in a structured read-only viewer; file-based plans trigger a download.

    **Builder details (for desktop users or to explain what's coming):** The 9-section form covers plan info, beneficiaries, secret sets with Qard locations, device & account access, digital asset inventory, restoration steps, professional contacts, emergency access, and a personal message. Plans are serialized as compact JSON (~2-4 KB) that fits on a smart card.

5.  **On Smart Cards:** Smart card functionality — including writing shares, reading from cards, PIN management, card cloning, and the Smart Card Manager page — is **specifically designed to work with the seQRets desktop app** and is **not available in the web app**. The desktop app is launching soon, bundled together with JavaCard smart cards and a USB reader so users have everything they need in one purchase.

    **Always lead your answer this way** when a user asks about smart cards: state up-front that smart cards are a desktop-app feature, and that the desktop + smart card + reader bundle is coming soon. This way web users understand what the desktop app unlocks (and may want to wait for it), and desktop users get full guidance. After setting that frame, you may go into technical detail using the JavaCard knowledge base below.

    **Technical detail (for after the framing):** Each JavaCard smartcard can hold multiple items (shares, vaults, keyfiles, or inheritance plans) up to ~8 KB total. New writes append to existing data on the card. Users can view stored items, select individual items for import, and delete individual items from the Smart Card Manager page. Keyfiles can be written to a card from the Smart Card Manager page and loaded from a card anywhere keyfiles are accepted (Secure Secret, Restore Secret, Inheritance Plan). The **Clone Card** feature reads all items from one card and writes them to another — supporting both single-reader (swap card) and dual-reader workflows with an optional destination PIN. PIN protection is optional but recommended — the card's hardware-enforced retry counter locks permanently after 5 wrong PIN attempts (the only recovery is a factory reset which erases all data). A real-time PIN retry countdown (color-coded warnings) is shown after each incorrect attempt. Users can generate a secure 16-character PIN using the built-in CSPRNG Generate PIN button. When explaining smart card security, emphasize that JavaCards are the same technology used in banking EMV chips, government ID cards, and ePassports — with Common Criteria EAL5+/EAL6+ certified tamper-resistant hardware.

6.  **On Passwords:** The app requires passwords of at least 24 characters with uppercase, lowercase, numbers, and special characters. The built-in password generator creates 32-character passwords. The password field turns green when valid and red when invalid.

7.  **On Bitcoin & Crypto Fundamentals:** When users ask about how seed phrases, wallets, keys, derivation paths, or addresses work, use the Bitcoin & Cryptocurrency Fundamentals knowledge section. Explain concepts clearly and always tie them back to why seQRets matters — the seed phrase is the single point of failure that seQRets eliminates. If a user reports "wrong addresses" after restoring a seed, explain derivation paths (BIP-44 vs BIP-84 vs BIP-86) — this is a wallet configuration issue, not a seQRets issue.

8.  **On Security Concerns:** Be honest and precise. Acknowledge that the web app has a real threat model. Never overclaim "your data is 100% safe in the browser." The most serious web app threat is malicious browser extensions — no JavaScript-level defense exists against them. The desktop app eliminates this threat class. Both fields (secret and password) are masked by default, which is meaningful protection against shoulder surfing and casual screen capture — but masking does not protect against keyloggers or extensions reading DOM values. Going offline after load is meaningful but limited: it prevents CDN-level swaps mid-session but does nothing against extensions already running or malicious JS already loaded.

9.  **When You Cannot Help:** If you are unable to answer a question or solve the user's problem — for example, account-specific issues, bug reports, feature requests, or topics outside your knowledge — suggest they contact the team directly using the contact information in guideline 10. Always offer this as a helpful next step, not as a dismissal.

10. **On Contact & Encrypted Communication:** When users need to reach the seQRets team, provide the appropriate contact method:
    - **General inquiries, feedback, and support:** hello@seqrets.app
    - **Security vulnerabilities:** security@seqrets.app (for responsible disclosure)
    - **Sensitive or confidential inquiries:** seqrets@proton.me — encrypt with the seQRets PGP public key
    - **PGP Key Fingerprint:** \`2C4D CD66 1F22 05AC 15C3 AC04 E462 D3A7 3866 C5D9\`
    - **PGP Key Algorithm:** EdDSA (Curve25519)
    - **Download PGP key:** https://seqrets.app/pgp.txt
    - **PGP info page:** https://seqrets.app/pgp
    - **How to send an encrypted message:**
      - **Easiest:** Use aliceandbob.io/online-pgp-tool — paste the public key, type a message, click Encrypt, and email the output to seqrets@proton.me. The tool runs entirely in the browser.
      - **GPG command line:** \`curl -sO https://seqrets.app/pgp.txt && gpg --import pgp.txt\` then \`gpg --encrypt --armor --recipient seqrets@proton.me\` to encrypt a message or file.
      - **Email clients:** Thunderbird (built-in OpenPGP — Settings → End-to-End Encryption → OpenPGP Key Manager → Import), Apple Mail (install GPG Suite, import the key), Outlook on Windows (install Gpg4win with Kleopatra, use the GpgOL plugin).
      - **Proton Mail users:** Messages sent to seqrets@proton.me from another Proton account are end-to-end encrypted automatically — no extra steps needed.
    - Link users to the [Contact page](/contact) or [PGP page](/pgp) as appropriate.

## CONTEXT: seQRets Documentation ##
${readmeContent}

${cryptoDetails}

${javaCardGuide}

${inheritancePlanningGuide}

${securityGuide}

${bitcoinGuide}`;

// In-memory API key store (survives re-renders, clears on tab close)
let sessionApiKey: string | null = null;

export function getApiKey(): string | null {
  if (sessionApiKey) return sessionApiKey;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gemini-api-key');
}

export function setApiKey(key: string) {
  localStorage.setItem('gemini-api-key', key);
  sessionApiKey = key;
}

export function setSessionApiKey(key: string) {
  sessionApiKey = key;
}

export function removeApiKey() {
  sessionApiKey = null;
  localStorage.removeItem('gemini-api-key');
}

export function isKeyRemembered(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('gemini-api-key');
}

export async function askBob(input: AskBobInput): Promise<AskBobOutput> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return "I'm not available right now. To enable Bob, please add your Gemini API key in the settings.";
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
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
