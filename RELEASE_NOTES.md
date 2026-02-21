## seQRets Desktop v1.0.1 🔥 Ignition
Protect your sensitive data with Shamir's Secret Sharing and XChaCha20-Poly1305 encryption.

### Downloads

| Platform | Download |
|---|---|
| 🍎 macOS (Apple Silicon) | [seQRets_1.0.1_aarch64.dmg](https://github.com/jalapeno4332/seQRets-Releases/releases/download/v1.0.1/seQRets_1.0.1_aarch64.dmg) |
| 🍎 macOS (Intel) | [seQRets_1.0.1_x64.dmg](https://github.com/jalapeno4332/seQRets-Releases/releases/download/v1.0.1/seQRets_1.0.1_x64.dmg) |
| 🪟 Windows | [seQRets_1.0.1_x64-setup.exe](https://github.com/jalapeno4332/seQRets-Releases/releases/download/v1.0.1/seQRets_1.0.1_x64-setup.exe) |
| 🐧 Linux (Debian/Ubuntu) | [seQRets_1.0.1_amd64.deb](https://github.com/jalapeno4332/seQRets-Releases/releases/download/v1.0.1/seQRets_1.0.1_amd64.deb) |
| 🐧 Linux (Universal) | [seQRets_1.0.1_amd64.AppImage](https://github.com/jalapeno4332/seQRets-Releases/releases/download/v1.0.1/seQRets_1.0.1_amd64.AppImage) |

### What's New

#### 🦀 Native Rust Crypto Backend (Desktop)
The desktop app now runs all key derivation and symmetric encryption natively in Rust via Tauri IPC — replacing the previous JavaScript Web Worker path entirely:

- **Argon2id** key derivation (64 MB memory, 3 iterations, 256-bit key)
- **XChaCha20-Poly1305** AEAD encryption with a 192-bit random nonce
- **Gzip compression** (level 9) before encryption
- **OS-backed CSPRNG** (`rand::thread_rng()`) for salts and nonces — drawn directly from the OS entropy pool without any JS layer
- **Compiler-fence key erasure** via the Rust `zeroize` crate — keys are guaranteed wiped by the optimizer-proof Zeroize trait; sensitive bytes never persist beyond each operation
- **Keys never cross the JS/Rust boundary** — the raw derived key exists only inside the Rust process

The wire format is **bit-for-bit identical** to the web app's `@noble/*` implementation. Qards created on desktop can be restored on web, and vice versa.

#### Security
- **Cryptographic memory hardening** — **Desktop:** the Rust `zeroize` crate provides compiler-fence guaranteed key erasure after every operation, eliminating the risk of optimized-out zeroing. **Web:** derived keys, decrypted plaintext, and keyfile bytes are explicitly zeroed via `fill(0)` in `finally` blocks
- **State hygiene after crypto operations** — keyfile data and Shamir share data are cleared from UI state immediately after a successful encrypt or restore operation
- **Bob AI disclaimer** — a one-time dismissible dialog now appears before users can chat with Bob, clearly stating that messages are sent to Google's Gemini API and that sensitive data should never be entered in chat
- **Corrected security messaging** — language accurately reflects the client-side encryption model vs. Bob's external API dependency

#### Features
- **In-app Inheritance Plan builder** — create your inheritance plan directly inside the app using a structured 7-section form. No need to type sensitive information into external editors. Plans encrypt as compact JSON (~2–4 KB) that fits on a smart card.
- **Three-tab Inheritance Plan layout** — Encrypt Plan | Create Plan | Decrypt Plan
- **Dynamic plan file naming** — saved plans use the preparer's last name (e.g., `Smith-Inheritance-Plan.json`) for easy identification
- **Smart plan detection on decrypt** — in-app plans are auto-detected and displayed in a structured read-only viewer
- **Updated app icon** — new seQRets Brn icon across all platforms

#### UI & Polish
- **Tab hover effects** — inactive tabs now show a visual hover cue across all pages
- **Rich dark theme** — Bob chat interface restored to full dark styling on both the popover and the dedicated support page

### Core Cryptography

- XChaCha20-Poly1305 AEAD encryption with Argon2id key derivation (64 MB, 3 iterations)
- Shamir's Secret Sharing — split secrets into QR code "Qards"
- BIP-39 seed phrase detection with compact binary entropy storage (24-word phrase → 32 bytes)
- **Desktop:** all cryptographic operations run natively in Rust — your raw secret and password never leave the Rust process, and derived keys are zeroized immediately after use
- **Web:** all cryptographic operations run client-side in the browser — your raw secret and password are never transmitted to any server

### Web App
Try seQRets in your browser at [app.seqrets.app](https://app.seqrets.app)

---

> **Note:** The remaining assets (`.sig`, `.tar.gz`, `.msi`, `.rpm`, `latest.json`) support automatic updates and alternative Linux distributions.

### Verify Your Download

After downloading, verify file integrity with a checksum:

**macOS:**
```bash
shasum -a 256 ~/Downloads/seQRets_1.0.1_aarch64.dmg
```

**Linux:**
```bash
sha256sum ~/Downloads/seQRets_1.0.1_amd64.deb
```

**Windows (PowerShell):**
```powershell
Get-FileHash ~\Downloads\seQRets_1.0.1_x64-setup.exe -Algorithm SHA256
```

Compare the output against the `sha256` hash shown next to each asset below.

---

> **Note:** Download URLs assume Tauri generates filenames in the `seQRets_1.0.1_*` pattern. Verify actual filenames once build artifacts are uploaded and adjust links if needed.
