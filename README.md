<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/icons/logo-dark.webp" />
    <source media="(prefers-color-scheme: light)" srcset="public/icons/logo-light.webp" />
    <img src="public/icons/logo-dark.webp" alt="seQRets Logo" width="200" />
  </picture>
</p>

<h1 align="center">seQRets</h1>

**Secure. Split. Share.**

seQRets encrypts your most sensitive secrets — seed phrases, private keys, passwords — and splits them into QR codes called **Qards** using **Shamir's Secret Sharing**. Recovering a secret requires a configurable threshold of Qards (e.g., 2 of 3), so no single Qard reveals anything on its own. Use it to protect your own digital assets or ensure your loved ones can inherit them.

> 🛡️ **Zero-knowledge, client-side only.** All encryption, splitting, and decryption happens entirely on your device. No servers, no cloud, no accounts, no telemetry. seQRets is <a href="https://github.com/seQRets/seQRets-app" target="_blank" rel="noopener noreferrer">open source</a> under AGPLv3 — audit every line.

## ⚠️ Warning

> 🚧 **Beta Software — No Independent Security Audit.** seQRets has not undergone a formal third-party security audit. Do not use seQRets as your only backup for high-value secrets. Always maintain independent backups (hardware wallet, paper backup in a fireproof safe, etc.) until a formal audit has been completed.

**Your security is your responsibility.** Misplacing your password or the required number of Qards can result in the **permanent loss** of your secret. The developers have no access to your data.

## 📦 Get seQRets

### 🌐 Web App (Free)

**<a href="https://app.seqrets.app" target="_blank" rel="noopener noreferrer">Launch seQRets Web App →</a>** — no installation required.

### 🖥️ Desktop App

| | Source Available (Unsupported) | Official Signed Release |
|---|---|---|
| **Cost** | Free | One-time purchase (price TBA) |
| **Source** | Compile from this repo | Signed pre-built binary |
| **Platforms** | Any (with Rust + Node.js) | macOS, Windows, Linux |
| **Auto-updates** | ✗ | ✓ |
| **Code signed** | ✗ | ✓ |
| **Smart card** | ✗ | ✓ Included |
| **Portable card reader** | ✗ | ✓ Included |

Build from source: see [docs/BUILDING.md](docs/BUILDING.md).
Official release: coming soon — **<a href="https://seqrets.app" target="_blank" rel="noopener noreferrer">join the waitlist at seqrets.app</a>**.

## ✨ Features

- **Encrypt** any text secret with XChaCha20-Poly1305 + Argon2id, split into configurable Qards (2-of-3, 3-of-5, etc.)
- **Restore** via drag & drop, camera scan, manual entry, vault file, or smart card
- **BIP-39 optimization** — 24-word phrases compress from ~150 chars to 32 bytes
- **SLIP-39 detection** — Trezor-style recovery shares (20/33 words) are recognized and checksum-validated on entry and on restore, so a mistyped word is caught before encryption; restored shares display as a numbered word list for easy re-entry into a hardware wallet
- **SeedQR display** on restore — Standard and Compact formats for scanning BIP-39 seeds into compatible hardware wallets
- **Built-in inheritance planner** (desktop only) — comprehensive 9-section form that walks you through beneficiaries, secret sets, Qard locations, device & account access, digital asset inventory, restoration steps, professional contacts, emergency access, and a personal message. The plan is encrypted natively and fits on a smart card. No need to type sensitive information into external editors. Web and desktop can also encrypt any external file (PDF, DOCX, ODT, ODS, ODP, JSON, TXT — up to 50 MB) the same way.
- **JavaCard smart card** storage (desktop only) — shares, vaults, keyfiles, or plans on JCOP3 hardware with optional PIN protection
- **Optional keyfile** as a second factor in addition to the password
- **Helper tools** — CSPRNG password generator, BIP-39 seed generator, Bitcoin ticker, Bob AI assistant (optional, user-provided Gemini key)
- **SHA-256 share integrity** — every Qard (web and desktop) embeds a SHA-256 hash and validates it at generation and on restore; corrupted or tampered Qards are detected before decryption. Desktop additionally surfaces a green shield indicator at restore time and prints a truncated fingerprint on physical cards for visual spot-checking.
- **100% offline-capable** — the only optional network call is Bob

## 🛟 seQRets Recover — Long-Term Recovery

Even if **seQRets disappears** — the website goes down, the company dissolves, the app stops being updated — your secrets are still recoverable.

**[seQRets Recover](https://github.com/seQRets/seQRets-Recover)** is an independent, single-file recovery tool for the seQRets share format. One HTML file with a small, self-contained codebase (~400-line crypto core), no install, no network. Open it in any browser on any machine, offline, and paste your Qards in.

- 📥 **Download** `recover.html` from the [latest release](https://github.com/seQRets/seQRets-Recover/releases/latest/download/recover.html)
- 🔒 **Verify** — each release publishes a SHA-256 so you can confirm copies handed to heirs are untampered
- 🏗️ **Build it yourself** from source — audit every line, archive it, mirror it, print it
- 📜 **Open format** — `seQRets|<salt>|<nonce+ciphertext>|sha256:<hex>` is plaintext, self-describing, and reimplementable in any language in an afternoon

**Save a copy of `recover.html` alongside your Qards.** Anyone holding the threshold of Qards plus the password can recover the secret with nothing but a web browser — no installation, no account, no dependency on this project still being around.

## 🔐 Security

seQRets uses industry-standard primitives entirely client-side. **The core cryptographic primitives live in a single ~750-line file: [`packages/crypto/src/crypto.ts`](packages/crypto/src/crypto.ts)** (with share-metadata and SeedQR helpers in [`restore.ts`](packages/crypto/src/restore.ts), and validation-only SLIP-39 share detection in [`slip39.ts`](packages/crypto/src/slip39.ts)). The desktop app additionally runs Argon2id + XChaCha20-Poly1305 natively in Rust via Tauri, so derived keys never enter the JS runtime.

- **Key derivation:** Argon2id (64MB memory, 4 iterations)
- **Encryption:** XChaCha20-Poly1305 (AEAD)
- **Splitting:** Shamir's Secret Sharing ([audited](https://github.com/privy-io/shamir-secret-sharing))
- **RNG:** OS-backed CSPRNG (Rust `rand` on desktop, `crypto.getRandomValues` on web)
- **Memory:** Rust `zeroize` on desktop; `fill(0)` + finally blocks on web
- **Length privacy:** payloads are padded to 192-byte buckets before encryption, so a Qard's size doesn't reveal the secret's size; every Qard carries a hash-covered `v=1` format-version marker for decades-later diagnosability

For the full cryptographic design and threat model, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
To report a vulnerability, see [SECURITY.md](SECURITY.md).

## 📚 Further Reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — cryptographic design, encrypt-first ordering, quantum resistance, RNG, and the web vs desktop threat model
- [docs/SMARTCARD.md](docs/SMARTCARD.md) — JavaCard hardware, features, applet AID
- [docs/BUILDING.md](docs/BUILDING.md) — build instructions for web, desktop, and the JavaCard applet
- <a href="https://seqrets.app/docs/inheritance" target="_blank" rel="noopener noreferrer">Inheritance Guide</a> — how to plan, distribute, and hand off Qards to your heirs
- [SECURITY.md](SECURITY.md) — vulnerability reporting policy
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guide and CLA

## 🤝 Contributing

Before reporting a bug, please search [existing issues](https://github.com/seQRets/seQRets-app/issues). Pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). By contributing, you agree to our [Contributor License Agreement](CONTRIBUTING.md#contributor-license-agreement-cla).

## 📄 License

Licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE).

Commercial licenses are available for proprietary use — email **licensing@seqrets.app**.

Copyright (c) 2026 seQRets — a product of Toothjockey LLC.

## ⚠️ Disclaimer

For maximum security, consider running seQRets on a computer provisioned specifically for secret management with no unnecessary network connectivity. The developers cannot be held liable for lost or stolen secrets. **USE AT YOUR OWN RISK.**

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. See [LICENSE](LICENSE) for full terms.
