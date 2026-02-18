<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/icons/logo-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="public/icons/logo-light.png" />
    <img src="public/icons/logo-dark.png" alt="seQRets Logo" width="200" />
  </picture>
</p>

<h1 align="center">seQRets</h1>

**Secure. Split. Share.**

seQRets is a hyper-secure, open-source application designed to protect your most sensitive digital information — from crypto seed phrases and private keys to passwords and other confidential data. It uses **Shamir's Secret Sharing** to split your secret into multiple QR codes called **Qards**.

To restore your original secret, you must bring a specific number of these Qards back together. This eliminates the single point of failure associated with storing secrets in one location, providing a robust solution for personal backup and cryptocurrency inheritance planning.

> **Version 0.9.9 "Sanctum"** (*Beta*) — Available as a web app (Next.js) and native desktop app (Tauri + Vite).

## ⚠️ Warning

**Your security is your responsibility.** seQRets gives you full control over your digital assets. Misplacing your password or the required number of Qards can result in the **permanent loss** of your secret. The developers have no access to your data, cannot recover your password, and cannot restore your secrets. Manage your Qards and password with extreme care.

## 📦 Get seQRets

### 🌐 Web App (Free)
Use seQRets directly in your browser — no installation required.

**[Launch seQRets Web App →](https://app.seqrets.app)**

### 🖥️ Desktop App

| | Build It Yourself (Free) | Official Signed Release |
|---|---|---|
| **Cost** | Free | TBD |
| **Source** | Compile from this repo | Signed pre-built binary |
| **Platforms** | Any (with Rust + Node.js) | macOS, Windows, Linux |
| **Auto-updates** | ✗ | ✓ |
| **Code signed** | ✗ | ✓ |
| **Smart card** | ✗ | ✓ Included |
| **Portable card reader** | ✗ | ✓ Included |

#### Build It Yourself

Clone this repo and compile the desktop app — it's fully open source under AGPLv3:

```bash
git clone https://github.com/jalapeno4332/seQRets.git
cd seQRets/packages/desktop
npm install
npm run desktop:build
```

#### Official Signed Release

Purchase an official release and receive:
- ✅ Code-signed binary for your platform (macOS, Windows, or Linux)
- ✅ Automatic updates — always stay on the latest version
- ✅ A complementary JavaCard-based smart card for secure key storage
- ✅ A portable USB smart card reader

**[Purchase Official Release →](https://seqrets.app/purchase)**

> 💡 **Why pay when it's open source?** You're paying for the convenience of signed builds with automatic updates, plus physical hardware (smart card + reader) shipped to your door. The source code is and always will be free.

---

## ✨ Features

### 🔒 Secure Your Secret
- Enter any text-based secret (seed phrases, private keys, passwords, etc.)
- Encrypt with a strong password (24+ characters required)
- Optionally add a **keyfile** as a second factor — both password AND keyfile are required for recovery; generate a keyfile and **download** or **save to Smart Card** (desktop only)
- **Keyfile smart card storage** — write keyfiles to JavaCard for tamper-resistant physical backup; load keyfiles from a smart card anywhere keyfiles are accepted (desktop only)
- Split into configurable Qards (e.g., 2-of-3, 3-of-5 threshold)
- Download Qards as QR code images or export as a `.seqrets` vault file
- **Write to JavaCard smartcard** — store individual shares, full vaults, keyfiles, or encrypted inheritance plans on JCOP3 hardware (desktop only)

### 🔓 Restore Your Secret
- **Drag & drop** QR code images from your file system
- **Upload** Qard image files (PNG, JPG)
- **Scan** QR codes with your camera (desktop and web)
- **Manual text entry** — paste raw share data
- **Import vault file** — load all shares at once from a `.seqrets` file
- **Read from smartcard** — load shares or vaults directly from a JavaCard (desktop only)
- Success sound plays on each accepted share

### 📜 Inheritance Plan
- **Standalone encryption** for heir instruction documents — no Qard shares required
- Encrypt any file (PDF, DOCX, ODT, TXT) with the same XChaCha20-Poly1305 + Argon2id security
- Password generator with the same 24-character multi-character-class requirement
- Optional keyfile support — generate a keyfile (with download or save to Smart Card) or upload an existing one (desktop only)
- **Save to File** (as `seqrets-instructions.json`) and/or **Write to Smart Card** (desktop only, if encrypted size ≤ 8 KB)
- Decrypt tab to restore the original document from the encrypted `.json` file or **load from Smart Card** (desktop only)
- Available on both web and desktop

### 🛠️ Helper Tools
- **Password Generator** — cryptographically secure 32-character passwords (88-character charset)
- **Seed Phrase Generator** — generate valid BIP-39 mnemonic phrases
- **Bitcoin Ticker** — live BTC/USD price display
- **Bob AI Assistant** — Google Gemini-powered AI for setup guidance and questions (optional, user-provided API key). Can be disconnected at any time by removing the API key from within the chat interface.

### 🧬 BIP-39 Optimization
Seed phrases are automatically detected and converted to compact binary entropy before encryption. A 24-word phrase (~150 characters) becomes just 32 bytes, dramatically reducing QR code size.

## 🔐 Security Architecture

All cryptographic operations run **entirely on your device**. Your secrets never leave your machine.

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| **Key Derivation** | Argon2id (64MB memory, 3 iterations, 32-byte key output) | Derive encryption key from password + optional keyfile |
| **Encryption** | XChaCha20-Poly1305 (AEAD) | Authenticated encryption with integrity verification |
| **Salt** | 16 random bytes (per operation) | Unique salt for each encryption — ensures distinct keys even with the same password |
| **Nonce** | 24 random bytes | Per-encryption nonce for XChaCha20 |
| **Splitting** | Shamir's Secret Sharing | Threshold-based secret splitting into Qards |
| **Compression** | Gzip (level 9) | Reduce payload size before encryption |
| **RNG** | Web Crypto API CSPRNG (`crypto.getRandomValues()`) | All random bytes — salts, nonces, passwords, seed entropy, keyfiles |
| **Memory** | Secure wipe | Overwrite sensitive data with random bytes after use |

### 🔗 Encrypt-First Architecture (Security by Design)

seQRets deliberately **encrypts first, then splits** — this ordering is a critical security choice:

```
Secret → Compress (gzip) → Encrypt (XChaCha20-Poly1305) → Split (Shamir's) → Distribute
```

Each Qard contains a fragment of the **encrypted** ciphertext — never raw plaintext. To recover the secret, an attacker must:

1. **Obtain** the required threshold of Qards (e.g., 2-of-3), AND
2. **Know** the password (+ keyfile, if used)

These are **layered defenses** — both must be defeated. The alternative design (split first, then encrypt each share individually) is weaker: each share becomes an independent encryption target, and cracking the password on a single share could reveal partial plaintext. With Encrypt→Split, a stolen Qard is computationally indistinguishable from random noise.

### ⚛️ Quantum Resistance

The built-in password generator produces passwords with ~10^62 possible combinations. Even with Grover's algorithm (optimal quantum speedup), brute-forcing would take:

- **Optimistic estimate:** ~2 × 10^18 years (148 million × the age of the universe)
- **Realistic estimate:** ~2 × 10^23 years (148 trillion × the age of the universe)

Argon2id's memory-hardness provides additional quantum resistance, and XChaCha20-Poly1305 maintains 128-bit effective quantum security as a defense-in-depth layer.

### 🎲 Random Number Generation (CSPRNG)

All randomness in seQRets is sourced from a **Cryptographically Secure Pseudo-Random Number Generator (CSPRNG)** — the Web Crypto API's `crypto.getRandomValues()`, which draws from the operating system's entropy pool (`/dev/urandom` on Linux/macOS, `BCryptGenRandom` on Windows).

| Operation | Entropy | Method |
|-----------|---------|--------|
| **Seed phrase (12 words)** | 128 bits | `@scure/bip39` → `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |
| **Seed phrase (24 words)** | 256 bits | `@scure/bip39` → `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |
| **Password generation** | 32 × 32-bit values | `window.crypto.getRandomValues(new Uint32Array(32))` mapped to 88-char charset |
| **Keyfile generation** | 256 bits | `window.crypto.getRandomValues(new Uint8Array(32))` |
| **Encryption salt** | 128 bits (16 bytes) | `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |
| **Encryption nonce** | 192 bits (24 bytes) | `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |

No `Math.random()` or any other weak PRNG is used for any security-critical operation.

## 💳 JavaCard Smartcard Support

The desktop app supports storing Shamir shares, encrypted vaults, and encrypted inheritance plans on **JCOP3 JavaCard smartcards** (e.g., J3H145), providing tamper-resistant physical backups that survive fire, water, and digital threats.

### Hardware Requirements
- **Card:** JCOP3 J3H145 or compatible JavaCard 3.0.4+ smartcard (~110 KB usable EEPROM)
- **Reader:** Any PC/SC-compatible USB smart card reader

### Features
- **Write individual shares**, **full vaults**, **keyfiles**, or **encrypted inheritance plans** to a card via APDU over PC/SC
- **Read back** shares, vaults, or keyfiles directly from a card into the restore workflow
- **Multi-item storage** — store multiple items (shares, vaults, keyfiles, instructions) on a single card up to ~8 KB; new writes append to existing data
- **Per-item management** — view, select, and delete individual items from the Smart Card Manager page
- **Optional PIN protection** (8-16 characters) — card locks after 5 wrong attempts
- **PIN retry countdown** — real-time display of remaining PIN attempts (color-coded: gray → amber → red) across both the Smart Card Manager page and the smart card dialog
- **Generate PIN** — CSPRNG-powered 16-character PIN generator (upper/lowercase, numbers, symbols) with copy-to-clipboard and reveal/hide toggle
- **Data chunking** — automatically handles payloads larger than the 240-byte APDU limit
- **Erase** confirmation to prevent accidental data loss

### Applet Installation

The SeQRets JavaCard applet must be installed on each card before use. All build tools (`ant-javacard.jar`, `gp.jar`, and the JavaCard 3.0.4 SDK) are included in the repository — no additional downloads are needed.

**Requirements:** JDK 11–17 and Apache Ant.

```bash
cd packages/javacard

# Install JDK and Ant (macOS — skip if already installed)
brew install openjdk@11 ant

# Build the applet
export JAVA_HOME=/opt/homebrew/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
ant clean build

# Install on card (card must be inserted in a PC/SC reader)
java -jar lib/gp.jar --install build/SeQRetsApplet.cap

# Verify installation
java -jar lib/gp.jar --list
```

> **Note:** Any JDK from version 11 through 17 will work. JDK 18+ is not supported by the JavaCard build toolchain. On macOS with Homebrew, you can also use `openjdk@17`.

### Applet AID
`F0 53 51 52 54 53 01 00 00` — selected automatically by the desktop app.

## 📁 Project Structure

seQRets is a monorepo with npm workspaces:

```
seQRets/
├── src/                     # Web app (Next.js 16 + React 19)
│   └── app/
│       ├── page.tsx         #   Home (Secure Secret / Restore Secret)
│       └── instructions/    #   Inheritance Plan (Encrypt / Decrypt)
├── packages/
│   ├── crypto/              # @seqrets/crypto — shared cryptography library
│   │   └── src/             #   XChaCha20, Argon2id, Shamir's, BIP-39
│   ├── desktop/             # @seqrets/desktop — Tauri v2 desktop app
│   │   ├── src/             #   React + Vite frontend (pages + components)
│   │   └── src-tauri/       #   Rust backend (PC/SC smartcard + macOS config)
│   └── javacard/            # JavaCard applet for smartcard storage
│       ├── src/             #   SeQRetsApplet.java (APDU command handler)
│       └── build.xml        #   Ant build file (produces .cap)
├── package.json             # Root workspace config
└── README.md
```

### 🧰 Tech Stack

| Component | Technology |
|-----------|------------|
| **Web App** | Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI |
| **Desktop App** | Tauri v2, Vite, React 19, TypeScript, Tailwind CSS, Radix UI |
| **Crypto Library** | @noble/ciphers, @noble/hashes, @scure/bip39, shamirs-secret-sharing-ts |
| **AI Assistant** | Google Gemini (via @google/generative-ai) |
| **QR Codes** | qrcode (generate), jsQR (decode) |
| **Smartcard** | JavaCard 3.0.4 applet, Rust pcsc crate, GlobalPlatformPro |

## 🚀 Getting Started

### 📋 Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Rust** (for desktop app only) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Xcode Command Line Tools** (macOS, for desktop app only) — `xcode-select --install`

### ⚙️ Setup

```bash
git clone https://github.com/jalapeno4332/seQRets.git
cd seQRets
npm install
```

### 🌐 Run the Web App

```bash
npm run dev
```

Opens at [http://localhost:9002](http://localhost:9002). All core features work offline — no API keys needed.

### 🖥️ Run the Desktop App

```bash
source ~/.cargo/env    # if Rust was just installed
npm run desktop:dev
```

### 📦 Build the Desktop Installer (.dmg)

```bash
npm run desktop:build
```

Produces `seQRets_0.9.9_aarch64.dmg` in `packages/desktop/src-tauri/target/release/bundle/dmg/`.

### 🤖 Optional: Bob AI Assistant

Bob is an AI assistant that can answer questions about seQRets, Bitcoin security, and inheritance planning. It's entirely optional.

- **Web app:** Set `GEMINI_API_KEY` in a `.env.local` file at the project root
- **Desktop app:** Click "Ask Bob" → follow the setup guide to enter your free Gemini API key from [Google AI Studio](https://aistudio.google.com/api-keys)
- **Remove API key:** Click "Remove API Key" at the bottom of the Bob chat to disconnect the assistant and delete the stored key. You can re-add a key at any time.

Your API key is stored locally and never sent to any server other than Google's Gemini API.

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start web app dev server (port 9002) |
| `npm run build` | Build web app for production |
| `npm run build:crypto` | Build the shared crypto package |
| `npm run desktop:dev` | Run Tauri desktop app in dev mode |
| `npm run desktop:build` | Build desktop .dmg installer |
| `npm run lint` | Run linter |
| `npm run type-check` | TypeScript type checking |

## 💡 How It Works

### 🔏 Encrypting a Secret

1. **Enter** your secret (seed phrase, private key, password, or any text)
2. **Secure** it with a strong password (and optional keyfile)
3. **Split** into your chosen Qard configuration (e.g., 2-of-3)
4. **Download** your Qards as QR images, a ZIP, a `.seqrets` vault file, or **write to a smartcard**

### 🔑 Restoring a Secret

1. **Add** the required number of Qards (drag-drop, upload, camera scan, smartcard, or manual entry)
2. **Enter** your password (and keyfile if used during encryption)
3. **Restore** — your original secret is revealed

### 📜 Encrypting an Inheritance Plan

1. **Upload** a document with instructions for your heirs (PDF, DOCX, ODT, TXT — up to 5MB)
2. **Set** a strong password (use the same password as your Qards, or generate a new one)
3. **Encrypt** — the file is encrypted with XChaCha20-Poly1305
4. **Save** — choose **Save to File** (downloads `seqrets-instructions.json`) and/or **Write to Smart Card** (desktop only, for files under 8 KB)

To decrypt, upload the encrypted `.json` file or **load from a smart card** (desktop only), then provide the same password (and keyfile if used).

## 🏛️ Inheritance Planning Guide

Cryptocurrency has no "forgot password" recovery. If the holder dies without a plan, the assets are permanently lost. seQRets is designed to solve this problem.

### The Split Trust Model

The recommended approach creates **layered security with no single point of failure**:

| Layer | What | How |
|-------|------|-----|
| **1. Split the Secret** | Encrypt and split your seed phrase into Qards | Use the **Secure Secret** tab with a 2-of-3 or 3-of-5 threshold |
| **2. Write the Plan** | Create a clear instruction document for your heirs | Use the **Inheritance Plan** tab to encrypt a PDF/DOCX with recovery steps |
| **3. Distribute** | Give Qards to different trusted people/locations | No single person or location gets everything |

### Example: 2-of-3 Distribution

| Item | Location | Who Has Access |
|------|----------|---------------|
| Qard 1 | Home fireproof safe | Spouse |
| Qard 2 | Trusted family member | Sibling or adult child |
| Qard 3 | Bank safe deposit box | Named on the box |
| Encrypted Plan | With estate attorney | Attorney (sealed) |
| Password | Inside the encrypted plan only | No one — until decrypted |

> **Critical rule:** The password should NEVER be stored alongside the Qards. Include it only inside the encrypted inheritance plan document.

### What to Put in Your Inheritance Plan Document

Your encrypted instruction document should include:
- **Asset inventory** — list of wallets, exchanges, and holdings (not the secrets themselves)
- **Recovery instructions** — step-by-step guide for using seQRets to restore the secret
- **Qard locations** — where each Qard is physically stored and who holds it
- **Password** — safe to include here because the document is encrypted
- **Keyfile location** — if used, where the keyfile is stored
- **Exchange accounts** — exchange names, registered emails, and instructions to contact them with a death certificate
- **Hardware wallet locations** — physical devices, PINs, and access instructions
- **Professional contacts** — attorney, financial advisor, trusted technical friend

### Common Mistakes

- ❌ Storing seed phrases in a will (wills become public during probate)
- ❌ Telling no one your crypto exists
- ❌ Giving one person all Qards + the password
- ❌ Never testing the recovery process
- ❌ Forgetting to update after acquiring new assets or changing passwords

### Legal Considerations

> ⚠️ **seQRets is not a legal tool.** Consult a qualified estate planning attorney for wills, trusts, powers of attorney, and tax planning. seQRets handles the technical security layer — splitting and encrypting your secrets — but a complete estate plan requires legal documentation.

Key topics to discuss with your attorney:
- **Digital asset clauses** in your will or trust
- **Revocable living trusts** to avoid probate for crypto assets
- **Durable power of attorney** explicitly covering digital assets (for incapacity, not just death)
- **Tax implications** — inherited crypto may receive a stepped-up cost basis

## 🤝 Contributing

This project is open source. Contributions, bug reports, and feature requests are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

By contributing, you agree to our [Contributor License Agreement (CLA)](CONTRIBUTING.md#contributor-license-agreement-cla).

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)** — see the [LICENSE](LICENSE) file for details.

### Commercial Licensing

We also offer commercial licenses for companies wanting to use seQRets in proprietary products or avoid copyleft — email **licensing@seqrets.app**.
