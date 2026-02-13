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

> **Version 0.9.0 "Pyre"** — Available as a web app (Next.js) and native desktop app (Tauri + Vite).

## ⚠️ Warning

**Your security is your responsibility.** seQRets gives you full control over your digital assets. Misplacing your password or the required number of Qards can result in the **permanent loss** of your secret. The developers have no access to your data, cannot recover your password, and cannot restore your secrets. Manage your Qards and password with extreme care.

## ✨ Features

### 🔒 Secure Your Secret
- Enter any text-based secret (seed phrases, private keys, passwords, etc.)
- Encrypt with a strong password (24+ characters required)
- Optionally add a **keyfile** as a second factor — both password AND keyfile are required for recovery
- Split into configurable Qards (e.g., 2-of-3, 3-of-5 threshold)
- Download Qards as QR code images or export as a `.seqrets` vault file
- **Write to JavaCard smartcard** — store individual shares, full vaults, or encrypted inheritance plans on JCOP3 hardware (desktop only)

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
- Optional keyfile support for additional security
- **Save to File** (as `seqrets-instructions.json`) and/or **Write to Smart Card** (desktop only, if encrypted size ≤ 8 KB)
- Decrypt tab to restore the original document from the encrypted `.json` file
- Available on both web and desktop

### 🛠️ Helper Tools
- **Password Generator** — cryptographically secure 32-character passwords (88-character charset)
- **Seed Phrase Generator** — generate valid BIP-39 mnemonic phrases
- **Bitcoin Ticker** — live BTC/USD price display
- **Bob AI Assistant** — Google Gemini-powered AI for setup guidance and questions (optional, user-provided API key)

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

## 💳 JavaCard Smartcard Support

The desktop app supports storing Shamir shares, encrypted vaults, and encrypted inheritance plans on **JCOP3 JavaCard smartcards** (e.g., J3H145), providing tamper-resistant physical backups that survive fire, water, and digital threats.

### Hardware Requirements
- **Card:** JCOP3 J3H145 or compatible JavaCard 3.0.4+ smartcard (~110 KB usable EEPROM)
- **Reader:** Any PC/SC-compatible USB smart card reader

### Features
- **Write individual shares**, **full vaults**, or **encrypted inheritance plans** to a card via APDU over PC/SC
- **Read back** shares or vaults directly from a card into the restore workflow
- **One item per card** — each card holds a single item; writing replaces existing data
- **Optional PIN protection** (8-16 characters) — card locks after 5 wrong attempts
- **Data chunking** — automatically handles payloads larger than the 240-byte APDU limit
- **Overwrite & erase** confirmations to prevent accidental data loss

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

Produces `seQRets_0.9.0_aarch64.dmg` in `packages/desktop/src-tauri/target/release/bundle/dmg/`.

### 🤖 Optional: Bob AI Assistant

Bob is an AI assistant that can answer questions about seQRets, Bitcoin security, and inheritance planning. It's entirely optional.

- **Web app:** Set `GEMINI_API_KEY` in a `.env.local` file at the project root
- **Desktop app:** Click "Ask Bob" → follow the setup guide to enter your free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

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

To decrypt, upload the encrypted `.json` file with the same password (and keyfile if used).

## 🤝 Contributing

This project is open source. Contributions, bug reports, and feature requests are welcome. Please open an issue or submit a pull request.

## 📄 License

MIT
