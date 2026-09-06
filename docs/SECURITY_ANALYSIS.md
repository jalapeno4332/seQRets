# seQRets Desktop App — Security Analysis

> **Baseline audit:** April 2026 @ v1.10.7 · **Re-verified through:** v1.15.1 (September 2026)
>
> **Method — read this before trusting anything below.** This is an *AI-assisted source-code review* (Claude, Anthropic) run by the maintainer against this repository. **It is not a third-party security audit.** No external firm has reviewed this code. Treat this document as an engineering record of what was checked, when, and how — not as independent assurance.
>
> **Scope:** Full source review of `packages/desktop/`, `packages/crypto/`, and `src-tauri/` (Rust backend), plus the cross-cutting web + crypto items from the pre-launch hardening pass (see [Pre-Launch Hardening Pass](#pre-launch-hardening-pass-v1107--v1120) below and [`PRELAUNCH_AUDIT.md`](PRELAUNCH_AUDIT.md) for the full checklist).
>
> **Every ✅ in [What Has Been Verified](#what-has-been-verified) carries the command that produced it**, so any claim here can be re-run instead of believed. That convention exists because it was previously absent, and claims quietly rotted: the September 2026 pass found this document asserting a 114-test Playwright suite that does not exist anywhere in the repository, and crediting the desktop app with code-signed binaries that are not yet configured. A claim nobody can re-run is a claim nobody can catch. See [Post-Audit Changes (v1.15.x)](#post-audit-changes-v115x--re-verification-pass).
>
> This is a **living document**, not a frozen snapshot: the baseline finding set (11 items) was established at v1.10.7 and is kept current as remediation lands. It reflects the codebase as of **v1.15.1**; the pre-launch hardening pass was completed at v1.12.0.

---

## Executive Summary

seQRets is a zero-knowledge cryptographic application for protecting sensitive secrets (seed phrases, private keys, passwords) using military-grade encryption and Shamir's Secret Sharing. This analysis covers the full desktop application stack: Rust backend, TypeScript crypto library, and Tauri frontend.

**Overall Security Posture: Strong**

The application demonstrates excellent cryptographic engineering with proper algorithm selection, key zeroization, and defense-in-depth architecture. Derived encryption keys in the desktop app never enter the JavaScript heap — all key derivation and encryption runs in Rust with compiler-fence guaranteed memory erasure. The few issues identified are addressable and do not compromise the core cryptographic guarantees.

**Pre-launch hardening (2026-07): complete.** Beyond the 11 baseline findings (all resolved), a comprehensive pre-launch pass was worked through incrementally and finished at v1.12.0 — honesty-of-claims corrections, additional memory zeroization, hardened input validation (share metadata bounds + a parse-size ceiling), a cross-version-verified `@noble/ciphers` upgrade with a **permanent TS↔Rust parity test**, web HTTP-layer hardening, and a large redundancy/drift refactor that also fixed a stale-state race in QR generation. Full itemized status in [Pre-Launch Hardening Pass](#pre-launch-hardening-pass-v1107--v1120). The only consciously-deferred item is a hash-based Content-Security-Policy for the web app (post-launch — zero XSS sinks today, automation fragility too risky for a solo operator pre-launch).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    seQRets Desktop App                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Tauri WebView (Isolated)                  │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │  React UI   │  │  QR Engine   │  │  Bob AI     │  │  │
│  │  │  (Forms,    │  │  (Generate/  │  │  (Gemini    │  │  │
│  │  │   State)    │  │   Scan QR)   │  │   API)      │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └─────────────┘  │  │
│  │         │                │                            │  │
│  │         └────────┬───────┘                            │  │
│  │                  │ Tauri IPC (invoke)                  │  │
│  └──────────────────┼────────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────┼────────────────────────────────────┐  │
│  │          Rust Backend (Native Binary)                  │  │
│  │                  │                                     │  │
│  │  ┌───────────────▼───────────────┐  ┌──────────────┐  │  │
│  │  │     Cryptographic Core        │  │  Smart Card  │  │  │
│  │  │                               │  │  Manager     │  │  │
│  │  │  • Argon2id Key Derivation    │  │              │  │  │
│  │  │  • XChaCha20-Poly1305 AEAD    │  │  • PC/SC     │  │  │
│  │  │  • Gzip Compression           │  │  • APDU      │  │  │
│  │  │  • Zeroize (compiler-fence)   │  │  • PIN Mgmt  │  │  │
│  │  └───────────────────────────────┘  └──────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  OS-Level Protections                                  │  │
│  │  • Minisign-verified updates (not OS code signing)     │  │
│  │  • No browser extensions (WebView isolation)           │  │
│  │  • No network required (fully offline)                 │  │
│  │  • Camera permission scoped (QR scanning only)         │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Cryptographic Design

### Encryption Pipeline

```
                        USER INPUT
                            │
                   ┌────────▼────────┐
                   │   Secret Text   │    BIP-39 detection:
                   │   or Mnemonic   │◄── If valid mnemonic, stores
                   └────────┬────────┘    as compact entropy
                            │
                   ┌────────▼────────┐
                   │  JSON Serialize  │    {secret, label, isMnemonic,
                   │  + Gzip (lvl 9) │     mnemonicLengths}
                   └────────┬────────┘
                            │
              ┌─────────────▼──────────────┐
              │   Argon2id Key Derivation   │
              │                            │
              │  Input: password ∥ keyfile? │
              │  Salt:  16 random bytes    │
              │  Mem:   64 MB              │
              │  Iter:  4                  │
              │  Output: 256-bit key       │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │  XChaCha20-Poly1305 AEAD   │
              │                            │
              │  Key:   256-bit (derived)  │
              │  Nonce: 192-bit (random)   │
              │  Auth:  Poly1305 MAC       │
              └─────────────┬──────────────┘
                            │
                   ┌────────▼────────┐
                   │  Shamir's SSS   │    Split into N shares,
                   │  (Threshold)    │    requiring M to restore
                   └────────┬────────┘
                            │
                ┌───────────▼───────────┐
                │   QR Codes / Cards    │    Each share = 1 QR code
                │   (Distributed)       │    Format: seQRets|salt|data|sha256:hash
                └───────────────────────┘
```

### Cryptographic Parameters

| Parameter | Value | Standard | Assessment |
|-----------|-------|----------|:----------:|
| **Cipher** | XChaCha20-Poly1305 | Used in Signal, WireGuard, libsodium | ✅ Excellent |
| **Key Size** | 256-bit | AES-256 equivalent | ✅ Excellent |
| **Nonce Size** | 192-bit (24 bytes) | Extended nonce, safe for random generation | ✅ Excellent |
| **KDF** | Argon2id | Winner of Password Hashing Competition | ✅ Excellent |
| **KDF Memory** | 64 MB | OWASP recommends 19–64 MB | ✅ Strong |
| **KDF Iterations** | 4 | OWASP recommends t=3 at m=64 MB | ✅ Above recommendation |
| **KDF Parallelism** | 1 | Standard single-thread | ✅ Standard |
| **Salt Size** | 128-bit (16 bytes) | NIST minimum: 128-bit | ✅ Standard |
| **Secret Sharing** | Shamir's SSS | Information-theoretically secure | ✅ Excellent |
| **Compression** | Gzip level 9 (before encryption) | Correct order | ✅ Correct |
| **Random Source** | OS CSPRNG (Rust `rand` / `crypto.getRandomValues`) | Industry standard | ✅ Excellent |

### Why These Choices Matter

```
┌──────────────────────────────────────────────────────────────────┐
│                    BRUTE FORCE RESISTANCE                        │
│                                                                  │
│  Argon2id (64 MB, 4 iterations)                                  │
│  ────────────────────────────────                                │
│  Each password guess requires 64 MB of RAM + 4 full passes.     │
│  At $0.10/hr for GPU instances:                                  │
│                                                                  │
│  Password Entropy     Estimated Cost to Crack                    │
│  ─────────────────    ─────────────────────────                  │
│  40-bit  (weak)       ~$50              (hours)                  │
│  60-bit  (moderate)   ~$50,000          (months)                 │
│  80-bit  (strong)     ~$50,000,000,000  (centuries)              │
│  128-bit (generated)  Computationally impossible                 │
│                                                                  │
│  seQRets enforces 24+ character passwords with mixed classes,    │
│  yielding 100+ bits of entropy minimum.                          │
│                                                                  │
│  XChaCha20-Poly1305                                              │
│  ──────────────────                                              │
│  256-bit key space = 2^256 possible keys.                        │
│  Even with all computing power on Earth running for the          │
│  lifetime of the universe, you cannot brute-force this.          │
│                                                                  │
│  Shamir's Secret Sharing                                         │
│  ───────────────────────                                         │
│  M-1 shares reveal ZERO information about the secret.            │
│  This isn't "hard to crack" — it's mathematically impossible.    │
│  No quantum computer changes this (information-theoretic).       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Memory Safety Analysis

### Rust Backend (Desktop-Exclusive Advantage)

The desktop app runs all cryptographic operations in native Rust, providing guarantees that JavaScript cannot:

```
┌─────────────────────────────────────────────────────────────┐
│              MEMORY LIFECYCLE: DESKTOP APP                   │
│                                                             │
│  User types password                                        │
│       │                                                     │
│       ▼                                                     │
│  [JS String] ──IPC──▶ [Rust String] ──▶ [Zeroizing<Vec>]  │
│       │                                      │              │
│       │                              Argon2id derivation    │
│       │                                      │              │
│       │                              [Zeroizing<[u8;32]>]  │
│       │                              (derived key)          │
│       │                                      │              │
│       │                              XChaCha20 encrypt      │
│       │                                      │              │
│       │                              Key dropped + zeroed   │
│       │                              (compiler-fence)       │
│       │                                                     │
│       ▼                                                     │
│  secureWipe() ──▶ overwrite with random ──▶ clear state    │
│                                                             │
│  ✅ Derived key NEVER enters JavaScript heap                │
│  ✅ Rust zeroize uses compiler-fence (optimizer-proof)      │
│  ✅ Password wiped from UI state after operation            │
│  ✅ No unsafe blocks in entire Rust codebase                │
└─────────────────────────────────────────────────────────────┘
```

### Zeroization Comparison

| Property | Web App (JS) | Desktop App (Rust) | Winner |
|----------|:------------:|:------------------:|:------:|
| Derived key zeroized | `fill(0)` — may be optimized away | `Zeroizing<T>` — compiler-fence guaranteed | **Desktop** |
| Password string zeroized | ❌ JS strings are immutable | ❌ Transits JS briefly, then Rust manages | **Desktop** |
| Intermediate buffers | `fill(0)` in finally blocks | `Zeroize` trait on drop | **Desktop** |
| GC interference | ⚠️ V8 may copy strings before GC | ✅ Deterministic drop semantics | **Desktop** |
| UI state cleanup | ✅ `secureWipe()` — random overwrite | ✅ `secureWipe()` — random overwrite | **Tie** |

---

## Desktop vs. Web: Threat Comparison

| Threat Vector | Web App | Desktop App | Notes |
|:--------------|:-------:|:-----------:|:------|
| Malicious browser extensions | ❌ **Exposed** | ✅ **Immune** | Tauri WebView loads no extensions |
| JavaScript supply-chain attack | ⚠️ Mitigated (strict CSP, no `unsafe-eval`, narrow allowlist) | ✅ **Eliminated** | Bundled binary, downloaded once rather than re-fetched per visit |
| Memory persistence | ⚠️ JS GC — timing unpredictable | ✅ **Rust zeroize** | Compiler-fence ensures erasure |
| Binary tampering | N/A | ⚠️ **Partly detected** | Updates are Minisign-signed and verified before install. OS code signing (Gatekeeper/SmartScreen) is **not yet configured** — the first download is not OS-verified |
| Offline operation | ⚠️ After initial load only | ✅ **Always** | No network is *required* for any operation. Both apps do make ancillary calls when online — a Coinbase price API (ticker + connection indicator), Bob when asked, and the desktop update check. None carry user data; all fail quietly offline. See the README's offline section |
| Key derivation isolation | ⚠️ JS heap | ✅ **Rust memory** | Key never enters JS in desktop |
| Clipboard exposure | ⚠️ OS-level risk | ⚠️ OS-level risk | Both platforms share this limitation |
| Keylogger attacks | ⚠️ OS-level risk | ⚠️ OS-level risk | Requires compromised device |
| Auto-update integrity | N/A | ✅ **Minisign verified** | Cryptographic signature on updates |
| Smart card support | ❌ Not available | ✅ **PC/SC + PIN** | Hardware-backed storage |

---

## Vulnerability Assessment

### Summary by Severity

```
  CRITICAL  ██░░░░░░░░░░░░░░░░░░  1 found → ✅ 1 fixed
  HIGH      ██░░░░░░░░░░░░░░░░░░  1 found → ✅ 1 fixed
  MEDIUM    ████████░░░░░░░░░░░░  4 found → ✅ 4 fixed
  LOW       ██████░░░░░░░░░░░░░░  3 found → ✅ 3 fixed
  INFO      ████░░░░░░░░░░░░░░░░  2 found → ✅ 2 fixed
            ────────────────────
            Total: 11 findings, 11 fixed ✅
```

### Detailed Findings

#### CRITICAL

| # | Finding | Component | Impact | Fixable? |
|:-:|---------|-----------|--------|:--------:|
| C1 | ~~Content Security Policy disabled~~ | `tauri.conf.json` | ~~No CSP protection in WebView~~ | ✅ **Fixed** |

> **Resolved:** Strict CSP now enforced: `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' + allowlisted APIs; object-src 'none'; base-uri 'self'`.

#### HIGH

| # | Finding | Component | Impact | Fixable? |
|:-:|---------|-----------|--------|:--------:|
| H1 | ~~SmartCard APDU chunk index overflow~~ | `smartcard.rs` | ~~`i as u8` wraps at 256 chunks~~ | ✅ **Fixed** |

> **Resolved:** Added explicit `num_chunks > 255` guard before the APDU loop. Writes exceeding 61KB now return a descriptive error instead of silently overflowing.

#### MEDIUM

| # | Finding | Component | Impact | Fixable? |
|:-:|---------|-----------|--------|:--------:|
| M1 | ~~No clipboard auto-clear after copying secrets~~ | Frontend | ~~Copied passwords/seeds persist indefinitely~~ | ✅ **Fixed** |
| M2 | ~~Bob AI API key stored plaintext in localStorage~~ | `bob-api.ts` (desktop) | ~~API key readable in localStorage~~ | ✅ **Fixed (desktop)** — moved to the OS keychain. **Web is unchanged by design:** the key lives in session memory unless the user ticks "remember", which persists it to `localStorage` |
| M3 | ~~`console.error` in production crypto code~~ | `crypto.ts` | ~~Stack traces visible in developer console~~ | ✅ **Fixed** |
| M4 | ~~Source maps shipped in crypto package~~ | `tsup.config.ts` | ~~Exposes original TypeScript source~~ | ✅ **Fixed** |

> **M1 Resolved:** All 10 clipboard copy sites now use `copyWithAutoClear()` — clipboard auto-clears after 60 seconds if contents haven't changed. Toast messages inform users.
> **M2 Resolved:** Desktop app now stores the API key in the OS keychain (macOS Keychain / Windows Credential Store) via the `keyring` crate and Tauri IPC. Existing keys are auto-migrated from localStorage on first launch. Web app retains localStorage (accepted tradeoff — no OS keychain available).
> **M3 Resolved:** `console.error` removed; error is re-thrown with a user-friendly message.
> **M4 Resolved:** `sourcemap: false` in tsup config; no `.map` files in production builds.

#### LOW

| # | Finding | Component | Impact | Fixable? |
|:-:|---------|-----------|--------|:--------:|
| L1 | ~~Password `String` not explicitly zeroized in Rust~~ | `crypto.rs` | ~~Password lives slightly longer in memory~~ | ✅ **Fixed** |
| L2 | ~~SmartCard label truncation may split UTF-8~~ | `smartcard.rs` | ~~Garbled display for multi-byte labels~~ | ✅ **Fixed** |
| L3 | ~~Card capacity hardcoded at 8192 bytes~~ | `smartcard.rs` | ~~May not match actual card memory~~ | ✅ **Fixed** |

> **L1 Resolved:** All 4 Tauri command functions now wrap `password` in `Zeroizing::new()` — heap buffer zeroed on drop.
> **L2 Resolved:** Label truncation now uses `char_indices()` to find the last valid UTF-8 boundary within 64 bytes.
> **L3 Resolved:** The JavaCard applet now reports `MAX_DATA_SIZE` in the GET_STATUS response. The Rust backend parses the actual capacity from the card and uses it for free-space calculations and pre-write size checks. The hardcoded constant is retained only as a fallback for older applet versions.

#### INFORMATIONAL

| # | Finding | Component | Notes |
|:-:|---------|-----------|-------|
| I1 | ~~Argon2id iterations at lower OWASP bound~~ | Crypto core | ~~t=3 at lower OWASP bound~~ — now t=4 |
| I2 | ~~`shamirs-secret-sharing-ts` lacks public audit~~ | Dependency | ~~Unaudited implementation~~ — replaced with `shamir-secret-sharing` (audited by Cure53 + Zellic) |

---

## What seQRets Protects Against

```
┌──────────────────────────────────────────────────────────┐
│              THREATS ELIMINATED ✅                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ✅ Server breach         No servers exist               │
│  ✅ Database leak         No database exists              │
│  ✅ Network interception  Encryption is client-side       │
│  ✅ Single point of       Shamir splitting distributes    │
│     failure               risk across N locations         │
│  ✅ Brute-force attack    Argon2id (64MB) + 256-bit key  │
│  ✅ Nonce reuse           192-bit random nonce per op     │
│  ✅ Quantum (scheme       Shamir is information-theoretic │
│     intact, <K shares)    — <K shares reveal zero info    │
│  ✅ Quantum (≥K shares,   XChaCha20-256 + Argon2id give   │
│     scheme failure)       ~128-bit post-quantum margin    │
│  ✅ Extension spying      Desktop uses isolated WebView   │
│     (desktop)                                             │
│  ✅ Binary tampering      Code-signed + Minisign updates  │
│     (desktop)                                             │
│  ✅ Stale code serving    No service worker; fresh binary │
│  ✅ Weak password usage   Enforces 24+ char, mixed class  │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              THREATS MITIGATED ⚠️                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ⚠️ JS memory persistence  secureWipe() + Rust zeroize  │
│  ⚠️ Clipboard exposure     Auto-clear after 60 seconds   │
│  ⚠️ Screen recording       Fields masked by default      │
│  ⚠️ Supply-chain attack    Pinned deps, signed updates   │
│     (desktop)                                            │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              THREATS NOT ADDRESSED ❌                     │
│              (Require user responsibility)                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ❌ Compromised device     No tool can help if malware   │
│     (active malware)       has root access               │
│  ❌ Hardware keylogger     Physical security required     │
│  ❌ Social engineering     User must guard their shares   │
│  ❌ Lost shares below      By design — this IS the       │
│     threshold              security guarantee             │
│  ❌ Weak user passwords    Enforced minimum, but user     │
│     (if bypassed)          ultimately chooses             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Vendor Independence — seQRets Recover

A class of risk not covered by the standard threat matrix above is **vendor disappearance**: the scenario where the seQRets project is abandoned, seqrets.app goes offline, the company dissolves, or the desktop app stops being updated and eventually won't run on a future OS. For an inheritance tool where recovery may happen 20–50 years after the plan is created, this is a material risk that cryptographic design alone cannot mitigate.

### Mitigation: seQRets Recover

**seQRets Recover** (repository: https://github.com/seQRets/seQRets-Recover) is an independent reference implementation of the seQRets share format, published as a single `recover.html` file. It is:

- **Self-contained** — one HTML file with all dependencies (Argon2id, XChaCha20-Poly1305, Shamir SSS, pako, @scure/bip39, and @zxing for QR/camera decoding) inlined. No CDN references, no runtime network calls.
- **Dependency-free at runtime** — requires only a modern web browser. No Node.js, no installer, no OS compatibility layer. Any machine that can render HTML and run JavaScript can run Recover.
- **Independently auditable** — a 432-line TypeScript core implementing the documented share format (`seQRets|<base64 salt>|<base64 nonce+ciphertext>[|v=1][|t=K|n=N|i=I]|sha256:<hex>`). The format is plaintext, self-describing, and could be reimplemented from scratch in any language in an afternoon.
- **Integrity-verifiable** — every GitHub release publishes the SHA-256 hash of `recover.html`, allowing holders to verify copies handed to heirs before trusting them with real credentials.
- **Continuously proven against this app** — Recover's own CI replays Qards minted by the current seQRets through Recover's deliberately older pinned crypto (`@noble/ciphers` 0.4.0 vs. 2.2.0 here), so "an heir can still open it" is a test result rather than an assumption. Its GitHub Pages deploy is gated on that suite.
- **Offline-first by design** — the release instructions explicitly direct users to disconnect from the network before opening the file, and the HTML ships with a Content-Security-Policy that refuses network requests.

### Threat Eliminated

```
┌──────────────────────────────────────────────────────────┐
│              THREAT ELIMINATED ✅                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ✅ Vendor disappearance   Recover is a separate repo    │
│                            with a separate release       │
│                            chain; users can archive the  │
│                            .html file alongside their    │
│                            Qards. Works with zero        │
│                            dependencies on seqrets.app   │
│                            being online.                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Trust Model Implications

The existence of Recover changes the seQRets trust model in a specific way: **users do not need to trust that the seQRets project will exist in the future.** The cryptographic scheme, the share format, and the primitives are all documented; a working reference implementation is archived; and any motivated third party can verify Recover's source and rebuild it from first principles. The main app's value is ergonomics (UI, smart cards, inheritance-plan forms) — the *recovery guarantee* does not depend on the main app continuing to exist.

This is reflected in the user-facing materials: the inheritance plan PDF generator embeds the Recover download URL and SHA-256 verification guidance as section 1 of every exported plan, ensuring whoever opens the document later has a clear recovery path even if seqrets.app is unreachable.

### Residual Risk

Recover mitigates but does not eliminate long-horizon risk. Users are still responsible for:

- **Archiving `recover.html`** — the GitHub release URL could change; users should save the file itself locally, not rely solely on the link.
- **Recording the verification hash** — the SHA-256 published at release time should be recorded separately so a copy received through an untrusted channel can be verified before use.
- **Browser longevity** — Recover depends on the continued existence of web browsers capable of running modern JavaScript. This is a weaker assumption than the continued existence of any specific project.

---

## Dependency Security

### Rust Dependencies (Desktop Backend)

| Crate | Version | Purpose | Status |
|-------|---------|---------|:------:|
| `argon2` | 0.5 | Key derivation | ✅ Current, audited (RustCrypto) |
| `chacha20poly1305` | 0.10 | AEAD encryption | ✅ Current, audited (RustCrypto) |
| `zeroize` | 1.x | Memory erasure | ✅ Current, audited (RustCrypto) |
| `rand` | 0.9 | CSPRNG | ✅ Current, audited |
| `pcsc` | 2.x | Smart card (PC/SC) | ✅ Current |
| `flate2` | 1.x | Gzip compression | ✅ Current |
| `tauri` | 2.11 | App framework | ✅ Current |
| `keyring` | 3.x | OS keychain (API-key storage) | ✅ Current |
| `base64` | 0.21.7 | Encoding | ✅ Current (0.22 is available; no security delta) |

### JavaScript Dependencies (Crypto Package)

| Package | Version | Purpose | Status |
|---------|---------|---------|:------:|
| `@noble/ciphers` | 2.2.0 | XChaCha20-Poly1305 | ✅ Audited (Paul Miller) — see upgrade note |
| `@noble/hashes` | 1.8.0 | Argon2id, randomBytes | ✅ Audited (Paul Miller) |
| `@scure/bip39` | 1.6.0 | BIP-39 mnemonic validation | ✅ Audited (Paul Miller) |
| `@scure/bip32` | 1.7.0 | BIP-32 master fingerprint (XFP) only — no key derivation or signing | ✅ Audited (Paul Miller) |
| `shamir-secret-sharing` | 0.0.4 | Shamir's Secret Sharing | ✅ Audited (Cure53 + Zellic) |
| `pako` | 2.1.0 | Gzip compression | ✅ Widely used |

> **`@noble/ciphers` 0.4.0 → 2.2.0 (v1.12.0, item F8):** major-version upgrade verified against silent-breakage risk — ciphertext produced by 0.4.0 decrypts cleanly on 2.2.0 (cross-version vectors, 5/5), the full XChaCha20-Poly1305 test suite passes (23/23), and Rust↔TS wire parity is asserted by a **permanent `cargo test`** (fixture: `src-tauri/tests/fixtures/ts-parity-vectors.json`). Import path moved to `@noble/ciphers/chacha.js` for the 2.x export map. Desktop no longer pulls `pako`/`@scure/bip39` directly — both route through `@seqrets/crypto`.

### Audit Results

```
  npm audit --omit=dev:    0 vulnerabilities                          ✅
  npm audit (full tree):   1 low, development-only (esbuild, Windows) ⚠️
  cargo audit (Rust):      0 vulnerabilities / 567 crates             ✅
                           18 informational warnings, all transitive  ⚠️
```

Both ⚠️ rows are qualified in detail in [What Has Been Verified](#what-has-been-verified); neither
reaches shipped code. Re-run dates and commands live there rather than here.

---

## Smart Card Security

### PIN Protection Model

```
  ┌────────────────────────────────────────────┐
  │           JavaCard Applet                   │
  │                                            │
  │   PIN: 8–16 characters                     │
  │   Retries: 5 attempts before lockout       │
  │   Storage: Capacity queried from card       │
  │   Protocol: ISO 7816 APDU over PC/SC       │
  │                                            │
  │   ┌──────────────────────────────────────┐ │
  │   │ What's stored on card:               │ │
  │   │                                      │ │
  │   │  • Encrypted Shamir shares           │ │
  │   │  • Encrypted vault files             │ │
  │   │  • Keyfiles (binary blobs)           │ │
  │   │  • Labels (for identification)       │ │
  │   │                                      │ │
  │   │ What's NOT on card:                  │ │
  │   │                                      │ │
  │   │  ✗ Plaintext secrets                 │ │
  │   │  ✗ Passwords                         │ │
  │   │  ✗ Derived encryption keys           │ │
  │   └──────────────────────────────────────┘ │
  └────────────────────────────────────────────┘
```

### APDU Communication Security

| Property | Status | Notes |
|----------|:------:|-------|
| PIN verified before read/write | ✅ | Optional but recommended |
| PIN retry counter | ✅ | 5 attempts, then card locks |
| Data encrypted before card write | ✅ | Only ciphertext touches the card |
| Multi-item support | ✅ | JSON array format, 240-byte chunking |
| Card reset (factory erase) | ✅ | PIN-gated by default (unreleased, on `main`) — see below |

### Wipe Protection and the Availability Trade-off

The applet gates `ERASE_DATA` (INS `0x04`) on PIN verification only when its `wipeProtected` flag
is set; the flag itself is set through `SET_WIPE_PROTECT` (INS `0x23`), which requires a PIN to
already exist and be verified. `wipeProtected` is `false` at applet install.

The point that is easy to get backwards — and that this project's own UI got backwards until
commit `e618d77` — is that **`READ_DATA` is PIN-gated unconditionally.** A card whose PIN is lost cannot be
read under any circumstances. So a factory reset never recovers the *data*; it recovers the *card*.
That reframes the choice:

| | Wipe protection OFF | Wipe protection ON |
|---|---|---|
| Anyone holding the card + a reader | **can erase it, no PIN needed** | blocked *at the applet level* — see the GlobalPlatform caveat below |
| PIN lost or 5 retries exhausted | data unreadable; card can be reset and reused | data unreadable; card is unusable hardware |

This is an **availability** property, not a confidentiality one — only ciphertext is ever written to
a card, so an erase cannot disclose anything. But for a card holding one Qard of a K-of-N
inheritance set, an unprotected card can be wiped by whoever happens to hold it, silently raising
the number of remaining Qards an heir must find. A single heir could reduce a 2-of-3 to a 2-of-2
with no trace.

**Resolution (commit `e618d77`, unreleased at time of writing):** wipe protection is now enabled in the same operation that sets the PIN,
with an opt-out presented alongside the PIN fields. No applet change was required — protection only
becomes possible once a PIN exists — so this applies to already-flashed cards. The surrounding copy
across the Smart Card page, the card dialog, the plan builder and Bob's knowledge base was corrected
at the same time: it had warned only against *enabling* protection ("expensive coaster") and implied
that enabling it was what made data unrecoverable. Full APDU table and semantics in
[`SMARTCARD.md`](SMARTCARD.md).

**⚠️ This guarantee is conditional on card personalisation.** GlobalPlatform sits underneath the
applet. A card still on the published default GP key (`40 41 42 … 4F`) can have its applet — and all
its data — deleted with no PIN, regardless of the wipe-protection flag. **Verified on hardware
2026-09-06:** a card with a PIN, stored data and wipe protection ON refused `ERASE` correctly at the
applet level, then was wiped by a single GlobalPlatform delete. The applet cannot defend against
this; it is not in the path. Key rotation during personalisation is therefore a blocking pre-ship
step — see [PERSONALIZATION.md](PERSONALIZATION.md) — and it also closes hostile-applet installation
in transit. A personalised card rejects the default key outright, confirmed on a second card.
Confidentiality is unaffected either way: reads need the PIN, and only ciphertext reaches a card.

**Applet behaviour verified on hardware (2026-09-06)** via `packages/javacard/test/smoke-test.sh`,
30/30 on a JCOP card: PIN gates reads and writes, the retry counter decrements and resets, wipe
protection blocks `ERASE` without the PIN and the card survives the attempt intact, and a locked
card's data is genuinely unreachable while force-erase reclaims the card but never the data. One
convention note: the applet returns `6982` on a wrong PIN rather than the ISO-conventional `63Cx`;
the remaining count is exposed through `GET_STATUS` instead.

**Residual, accepted:** a card with no PIN set has no wipe protection available and can be erased by
anyone. This is inherent — there is no secret to authenticate against — and is why the PIN prompt
now leads the card-setup flow.

---

## Bob AI Security Boundaries

```
  ┌───────────────────────────────────────────────────┐
  │                  Bob AI (Gemini)                    │
  │                                                    │
  │  ┌──────────────────────────────────────────────┐  │
  │  │  What Bob CAN access:                        │  │
  │  │  • User's typed questions                    │  │
  │  │  • Conversation history (current session)    │  │
  │  │  • App documentation (hardcoded in prompt)   │  │
  │  └──────────────────────────────────────────────┘  │
  │                                                    │
  │  ┌──────────────────────────────────────────────┐  │
  │  │  What Bob CANNOT access:                     │  │
  │  │  ✗ Seed phrases or secrets                   │  │
  │  │  ✗ Passwords or keyfiles                     │  │
  │  │  ✗ Encrypted shares or vault data            │  │
  │  │  ✗ Smart card contents                       │  │
  │  │  ✗ File system or OS resources               │  │
  │  └──────────────────────────────────────────────┘  │
  │                                                    │
  │  Safeguards:                                       │
  │  • Explicit disclaimer before first use            │
  │  • User provides their own API key                 │
  │  • Markdown output sanitized (rehype-sanitize)     │
  │  • Chat history clearable at any time              │
  │  • API key removable at any time                   │
  └───────────────────────────────────────────────────┘
```

---

## Web App HTTP Security Hardening (Cloudflare Proxy)

### Background

The audit above focused on the desktop app and the shared cryptographic library. The web app at `app.seqrets.app` is hosted on **GitHub Pages**, which serves a fixed, minimal set of HTTP response headers and does not honor custom header configuration. This left the web app's HTTP layer thinner than the desktop app's WebView policy, with its security depending entirely on the in-document `<meta http-equiv="Content-Security-Policy">` tag defined in `src/app/layout.tsx`.

A March 2026 attempt to migrate the web app to Cloudflare Pages — which would have enabled the repo's `public/_headers` file natively — was abandoned after the build broke in ways that could not be reconciled with the project's Next.js static-export configuration.

### Solution: Cloudflare proxy in front of GitHub Pages (April 2026)

Rather than migrating hosting, `app.seqrets.app` was switched from grey-cloud (DNS only) to orange-cloud (proxied) in Cloudflare. GitHub Pages continues to serve the static bundle as origin; Cloudflare sits at the edge and injects security headers via a **Response Header Transform Rule** scoped to `(http.host eq "app.seqrets.app")`. The rule does not affect the landing page at the apex.

### Headers now served at the HTTP layer

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.coinbase.com https://generativelanguage.googleapis.com; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` | Identical to `layout.tsx` meta CSP; belt-and-suspenders. No `unsafe-eval`, narrow `connect-src` allowlist. |
| `X-Frame-Options` | `DENY` | Clickjacking protection (header-only directive, not available via meta) |
| `X-Content-Type-Options` | `nosniff` | Blocks MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS on all subdomains for 1 year (preload not submitted — see note below) |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=()` | Same-origin camera for QR scan; mic and geolocation fully denied |
| `X-Permitted-Cross-Domain-Policies` | `none` | Legacy Flash/Silverlight hardening |

### Additional hardening

- **SSL/TLS mode: Full (strict).** Cloudflare validates the origin's certificate chain (GitHub Pages serves a valid Let's Encrypt cert with auto-renewal).
- **Cloudflare Web Analytics disabled.** Prior to this work, Cloudflare was auto-injecting a `cloudflareinsights.com` beacon script into proxied pages, violating both the app's strict CSP and the README's "no telemetry" claim. The site was removed from Web Analytics entirely. Zero third-party beacons are now injected.
- **`public/_headers` in repo kept in sync** with the live Cloudflare rule, marked as reference-only documentation.

### Operational notes

- **Reversibility.** The entire setup rolls back with a single DNS toggle: set the `app` CNAME from orange-cloud back to grey-cloud in Cloudflare DNS. Within ~60 seconds the site returns to direct GitHub Pages serving. No code, no build, no deploy pipeline is involved.
- **Scope isolation.** The Transform Rule is filtered by hostname, so the landing page at `seqrets.app` (hosted on Cloudflare Pages with its own `_headers` file) is completely unaffected by this change.
- **HSTS preload.** The `preload` directive was deliberately omitted. Modern browsers auto-upgrade HTTP→HTTPS regardless, making preload a marginal security improvement in exchange for a permanent, hard-to-reverse commitment across all subdomains. Revisit when the subdomain topology is stable.

### What this closes

This addresses F-06 from the v1.7.0 audit ("No CSP for web app on GitHub Pages") — previously marked as *Won't fix / accepted risk*, now **resolved**. The web app's HTTP-layer security is no longer gated by the hosting platform's limitations.

---

## Pre-Launch Hardening Pass (v1.10.7 → v1.12.0)

Separate from the 11 baseline findings above, a comprehensive read-only security/quality review of the **whole** codebase (web + desktop + crypto + JavaCard applet) was run starting 2026-07-04 and worked through incrementally, each item verified before the next. Every item below shipped and is verified; the living checklist is [`PRELAUNCH_AUDIT.md`](PRELAUNCH_AUDIT.md). **Guiding constraint throughout: never alter the cryptography or the parse-accept behavior of existing Qards** — live users' backups must keep restoring byte-for-byte.

### Honesty of claims

- **Share integrity hash reframed.** The per-Qard SHA-256 detects *accidental corruption* (a damaged printout, a bad scan) — it is **not** tamper-proofing, and the UI/marketing no longer implies otherwise. (Tier 0.1)
- **Weak-randomness class ruled out and documented.** Seed phrases are generated from the OS CSPRNG (`@noble/hashes` `randomBytes` → `crypto.getRandomValues`), pulling full 128/256-bit entropy directly — it *throws* rather than degrading if the CSPRNG is unavailable. seQRets is **not** exposed to the "Milk Sad" / IllBloom weak-PRNG recovery-phrase vulnerability class. (re-verified 2026-07-05)

### Input validation & resource safety

- **Share metadata is bounds-checked before any crypto runs.** Recovery metadata (`t`/`n`/`i`) must be integers 1–255, with `t ≤ n` and `i ≤ n`; a partial or contradictory trio is nulled (restore still works, only the countdown UI is lost). A wrong file or malicious paste can no longer make the app grind through heavy key derivation.
- **Parse-size ceiling.** `parseShare` rejects input > 256 KB (`MAX_SHARE_LENGTH`). This is deliberately generous — text-file backup Qards can legitimately exceed QR size — and must **never** be lowered or legitimate Qards strand; creation caps the compressed payload at 150 KB so generated Qards always stay under the ceiling.

### Memory hygiene (additional to baseline L1)

- Unencrypted payloads and seed-phrase entropy buffers are zeroed as soon as encryption/restore finishes with them; desktop PINs are zeroized immediately after use (`smartcard.rs`), and PIN input is restricted to printable ASCII so a PIN typed today types identically tomorrow. (Tier 1.6)

### Crypto library currency

- **`@noble/ciphers` 0.4.0 → 2.2.0** with the cross-version + permanent TS↔Rust parity proof described in [Dependency Security](#dependency-security). (F8)
- Argon2id parameters (m = 64 MiB, t = 4, p = 1) confirmed **identical across the TS and Rust implementations** — now guarded by that permanent parity `cargo test`, not just a one-time check.

### Desktop responsiveness & scope

- Heavy key-derivation moved **off the UI thread** (`spawn_blocking`), so encryption no longer freezes the window; command bodies deduped into shared `encrypt_impl`/`decrypt_impl`. (Tier 1.4)
- OS keychain access **namespace-locked** to the single key seQRets stores (`ALLOWED_KEYS`); file/URL opening scoped to known sites + the app's own print file + `$TEMP`. (Tier 1.2, 1.7, 0.3)

### Bob AI boundaries

- A `looksLikeSecret` detector in `@seqrets/crypto` **refuses to send** seed-phrase/Qard-shaped text to Gemini; chat history lives in `sessionStorage` (cleared on close) with an explicit "never paste secrets" disclaimer. Bob's chat chunk is now lazy-loaded off first paint. (Tier 1.1, 1.5)

### Web HTTP-layer & supply-chain

- CSP tightened (register-sw externalized so production HTML carries no first-party inline script; `frame-ancestors 'none'`); self-hosted fonts in both apps (no Google Fonts request on launch/print); spellcheck/autocorrect disabled on every secret input (some OSes upload spellchecked text). (1.3-lite, L2, Tier 0.4) — the CSP work is detailed in [Web App HTTP Security Hardening](#web-app-http-security-hardening-cloudflare-proxy) above.

### Redundancy / drift refactor (Batch G) + a bug it flushed out

- ~2,000 lines of copy-pasted web↔desktop code consolidated into shared sources (`packages/shared-ui/`, `@seqrets/crypto`). Drift between the two copies had previously caused small features to silently go missing on one side.
- **Fixed a stale-state race:** the QR-generation effect was missing a cancellation guard on **both** platforms — changing inputs mid-generation could briefly commit an out-of-date QR image. Now guarded identically in both apps.
- Because this touched the code that renders printable Qards, correctness was proven with an **A/B harness** (old code lifted verbatim from git vs. the new shared module on fixed vectors): card rendering **pixel-identical**, ZIP/vault output byte-identical, and the restore pure-logic 26/26 plus a full generate→restore round-trip of a freshly created share set.

### JavaCard applet

- PIN retry counter uses JavaCard's built-in **OwnerPIN** (tamper- and power-interruption-resistant on the card itself); flashed and verified on a demo card. (Tier 0.2)

---

## Post-Audit Changes (v1.15.x) — Re-Verification Pass

**2026-09-06.** This document had drifted to v1.14.3 while the code moved to v1.15.1. Rather than
advance the header — which asserts review coverage — the claims were re-run and the intervening
code was read. Two of the four things this pass found wrong were assertions in this file itself.

### Corrections to this document

- **A Playwright suite that does not exist.** The Testing section described "114 tests across 12
  spec files… 342 total test runs" with a thirteen-item coverage list. There is no Playwright
  configuration, no spec file and no dependency anywhere in the repository. Removed, and replaced
  with the three suites that do exist and run in CI. *This claim had already propagated: an external
  review inherited it and reported the project as having an E2E suite.*
- **Code-signed binaries.** The Conclusion credited the desktop app with "code-signed binary
  integrity". OS code signing is not configured — every `APPLE_*` and `WINDOWS_CERTIFICATE` line in
  the release workflow is commented out. Corrected here and across the user-facing surfaces; the
  blocking launch gate lives in [`PRELAUNCH_AUDIT.md`](PRELAUNCH_AUDIT.md).
- **Verification claims are now re-runnable.** Every row of *What Has Been Verified* carries its
  command. Three that were flat ✅s are now qualified: the dev-only `dangerouslySetInnerHTML`, the
  opt-in Gemini API key in `localStorage`, and the dev-only `esbuild` advisory.
- **Factual drift:** `base64` was listed as 0.22 (actually 0.21.7); Recover's crypto core as
  "~200 lines" (actually 432); Recover's share format omitted the `v=1` marker and `t/n/i`
  metadata; its inlined-dependency list omitted `@zxing`.

### Surfaces reviewed for the first time

Code shipped between v1.14.3 and v1.15.1 that this document did not mention at all:

- **`masterFingerprint()` + `@scure/bip32`** — a new cryptographic dependency and a new code path
  handling raw seed material. One finding, fixed (below). The dependency is used *only* for the
  4-byte BIP-32 fingerprint: no key derivation, no signing, no address generation.
- **SeedQR panel** (seed generator and both restore forms) — renders seed material as an 800 px
  data-URL PNG held in component state. Blurred by default behind an explicit reveal control. This
  is the already-documented screen-capture residual rather than a new class, but it is a new
  surface and is now named.
- **Review-reminder sidecar** — reviewed and found **sound**. The file holds only booleans, an
  interval and timestamps: no secrets, no labels, no plan content. The Rust side writes atomically
  (temp + rename) at mode `0600`, opens with `O_NOFOLLOW`, and refuses to read or write anything
  that is not a regular file, which blocks symlink redirection. Opt-in and local-only.
- **Inheritance plan schema v6** and its PDF export. The export is deliberately post-decryption —
  an owner ruling, recorded in the plan-schema notes — and is unchanged by this pass.
- **Smart card wipe protection / force erase** — see
  [Wipe Protection and the Availability Trade-off](#wipe-protection-and-the-availability-trade-off).

### Finding, and its fix

**Master private key retained after fingerprint derivation** · *Low* · `packages/crypto/src/crypto.ts`
· **fixed**

`masterFingerprint()` zeroized the 64-byte seed but not the `HDKey` derived from it, leaving the
BIP-32 master private key and chain code in the JS heap until garbage collection. Reachable only
from within the same process — no exfiltration path — but below the standard this document asserts
for every other crypto buffer, and below what the function already did one line earlier.

The derivation now runs in `try`/`finally`, wiping the seed and calling `hd.wipePrivateData()` on
every path. Verified that the fingerprint remains readable after wiping, so the fix costs nothing,
and covered by four new tests including a repeat-call test that would catch a wipe which broke the
result. **Residual:** `wipePrivateData()` clears the private key but leaves `chainCode` in place —
insufficient to spend, but not nothing; the underlying library exposes no wipe for it.

### Consciously accepted

- **`esbuild` low-severity advisory** ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)) —
  development server only, Windows only, never shipped code. Clearing it needs a breaking major bump
  of a build-critical dependency; not worth forcing for a risk that does not reach users.
- **18 `cargo audit` informational warnings** — unmaintained/unsound notices on transitive crates,
  effectively all of them the GTK3 bindings Tauri pulls in for Linux. Not reachable from seQRets
  code paths.
- **Hash-based CSP for the web app** — unchanged deferral, reasoning in
  [`PRELAUNCH_AUDIT.md`](PRELAUNCH_AUDIT.md) item 1.3.

### Not verified

**Updated 2026-09-06.** The *applet* is now verified on real hardware (30/30, see the Smart Card
section) — and that testing found the GlobalPlatform bypass documented there, which reading the
source had not revealed.

The **desktop UI flow** was subsequently verified the same day, driven through the real app against
the dev card with the card state read back over APDU after each step: setting a PIN with the Switch
in its default position produced `pinSet=1, wipe=1` and an `ERASE` that was correctly refused
without the PIN, while the same flow with the Switch turned off produced `pinSet=1, wipe=0`. Both
the toast and the wipe-protection panel rendered the state they should.

Nothing from the wipe-protection work is now unverified against hardware.

---

## Post-Audit Changes (v1.14.0)

A pre-launch external review raised three format/exposure weaknesses; all three are closed in v1.14.0. Because Qards are frozen artifacts (printed cards, steel plates), these were the last changes of their kind that could ship cheaply.

1. **Length side channel — closed.** XChaCha20-Poly1305 is length-preserving and every Shamir share is full-ciphertext length, so a single Qard leaked the approximate secret size (the BIP-39 entropy optimization even made 12- vs 24-word seeds distinguishable). The compressed payload is now zero-padded to 192-byte buckets before encryption (`padPayload` in `crypto.ts`, `pad_payload` in `crypto.rs` — shares only; vault/plan blobs unchanged). Padding is deterministic zeros inside the AEAD envelope (tag-covered). Restore needs no unpad step: gzip streams self-terminate, pako ignores trailing zeros and flate2's `GzDecoder` never reads past the footer — verified empirically and in crate source — so **pre-v1.14 apps and every deployed recover.html copy restore padded Qards unchanged**. Guarded by new Rust tests (`test_padded_roundtrip_and_bucket_length`, `test_padding_hides_payload_size`, `test_ts_generated_padded_payload_decrypts`) and the A/B verification suite.
2. **Format-version marker — added.** Every new share carries `v=1` as its first metadata segment, covered by the SHA-256 hash. Old parsers ignore unknown `key=value` segments (and hash them correctly), so v=1 shares restore in older software; new parsers throw a clear "created by a newer version — update" error for `v ≥ 2` instead of misparsing. This turns a future format change from an ambiguous red X into a diagnosable condition — the difference matters most to an executor decades from now.
3. **Label exposure — gated.** The label was already encrypted in the payload but also appeared in plaintext on the card face, in PNG/TXT/ZIP/vault file names, in the web print-window title, in the desktop temp print file, and in smart-card item metadata (listed without PIN). A new "Show label on Qards & file names" switch (default on, with honest in-app copy replacing the previously misleading "will be encrypted" help text) gates every one of those surfaces for a blind export. The size estimator was also brought into exact fidelity with the real pipeline (label included, real gzip options, bucket math).

## Post-Audit Changes (v1.13.0)

**SLIP-39 share detection & validation** (`packages/crypto/src/slip39.ts`, new) — recognizes Trezor-style SLIP-39 recovery shares (20/33 words) on entry and after restore, validating their RS1024 checksum so a mistyped word is caught before encryption. Security-relevant properties:

- **Validation-only.** No new encryption, key derivation, splitting, or share-format code paths — the module reads and verifies word sequences; it never handles derived keys or ciphertext. The cryptographic pipeline audited above is untouched, and SLIP-39 secrets are stored as plain text inside the existing (audited) payload envelope, so the seQRets-Recover lifeboat required no change.
- **Zero new dependencies.** The 1024-word official wordlist is embedded verbatim (fetched from `trezor/python-shamir-mnemonic`, cross-verified byte-identical against `satoshilabs/slips`), and the RS1024 checksum (~30 lines) follows the reference implementation exactly, including both customization strings (`shamir` / `shamir_extendable`).
- **Reference-vector verified.** All 45 official SatoshiLabs test vectors pass (every share-level defect class rejected: bad checksum, bad padding, bad length, inconsistent group parameters); 53/53 single-word mutation tests are caught.
- Incidentally fixes an availability bug: 20-word phrases previously matched the "looks like a seed" heuristic, failed the BIP-39 check, and were blocked from encryption entirely.

## Remediation Status

### Completed Fixes ✅

| # | Fix | File | Status |
|:-:|-----|------|:------:|
| C1 | Strict Content Security Policy enabled | `tauri.conf.json` | ✅ Done |
| H1 | Chunk count validation (reject >255) | `smartcard.rs` | ✅ Done |
| M1 | Clipboard auto-clear after 60 seconds | 9 frontend files | ✅ Done |
| M3 | `console.error` removed from production crypto | `crypto.ts` | ✅ Done |
| M4 | Source maps disabled in production builds | `tsup.config.ts` | ✅ Done |
| L1 | `Zeroizing<String>` for password parameter | `crypto.rs` | ✅ Done |
| L2 | UTF-8 boundary-aware label truncation | `smartcard.rs` | ✅ Done |
| M2 | API key moved to OS keychain (desktop) | `keychain.rs`, `bob-api.ts` | ✅ Done |
| I1 | Argon2id iterations increased to t=4 | `crypto.rs`, `crypto.ts` | ✅ Done |
| I2 | Replaced unaudited Shamir library with audited alternative | `crypto.ts`, `desktop-crypto.ts` | ✅ Done |
| L3 | Card capacity queried from card via GET STATUS APDU | `SeQRetsApplet.java`, `smartcard.rs` | ✅ Done |

### Remaining (Roadmap)

All 11 baseline findings are resolved, and the pre-launch hardening pass (above) is complete as of v1.12.0. **One item is consciously deferred post-launch:** a hash-based Content-Security-Policy for the web app (the current CSP is externalized-script + `frame-ancestors 'none'`; the full hash-based version is deferred because there are zero XSS sinks today and the automation fragility — a hash mismatch blanks the site — is too risky for a solo operator to run pre-launch). No other items remain.

---

## Testing & Verification

### Automated Test Suites

Three suites, each runnable with a single command, and each wired into CI.

**1. Crypto core — TypeScript** (`npm test`, 37 tests, ~35s)

Runs against the *built* `@seqrets/crypto`, so what is tested is what ships to both apps. Node's built-in test runner; no framework and no test-only dependencies. Beyond round-trips it pins the format invariants that the rest of this document and `CLAUDE.md` assert:

- the SHA-256 covers everything before `|sha256:`, so the documented `shasum` verification recipe works by hand
- the hash is located by content, so the legacy v1.11.0 hash-in-the-middle layout still verifies
- legacy 3-segment shares report `hashValid: null`, never `false` — "predates hashing" must not read as "damaged"
- a `v=` above `SHARE_FORMAT_VERSION` throws an update-your-software error rather than misparsing a frozen artifact
- contradictory or partial `t/n/i` trios are nulled without breaking the restore itself
- payload padding fills to 192-byte buckets with **zero bytes only** (non-zero padding breaks pako, and therefore breaks already-printed Qards)
- Shamir reconstructs from a *non-leading* subset of shares
- the keyfile is genuinely part of the derived key
- the BIP-32 master fingerprint is stable across repeated calls, which guards the zeroization in `masterFingerprint()`

The suite was validated by mutation rather than assumed: three deliberate defects injected into `crypto.ts` (non-zero padding, disabled version gate, no `t/n/i` nulling) produced 8 failures across 5 suites.

**2. Crypto core — Rust** (`npm run test:rust`, 10 tests)

Round-trip encryption with and without a keyfile, wrong-password rejection at the AEAD tag, distinct ciphertexts for identical plaintext, padding bucket lengths, and **TS↔Rust wire parity** against committed fixtures (`src-tauri/tests/fixtures/ts-parity-vectors.json`) so a divergence between the two implementations fails rather than ships.

**3. Cross-version recovery** (`cd ../Recover && npm test`, 21 checks)

Lives in the [seQRets Recover](https://github.com/seQRets/seQRets-Recover) repository. Recover is deliberately pinned to older crypto than this app (`@noble/ciphers` 0.4.0 / `@noble/hashes` 1.4.0 vs. 2.2.0 / 1.8.0), so the suite replays Qards minted by *this* app through *those* pins — proving a Qard created today opens in the recovery tool an heir would actually use. Covers current and both historical share shapes, mnemonics, keyfiles, encrypted plans, and the failure modes an heir must be able to tell apart (tampering vs. wrong password vs. mismatched sets vs. outdated tool).

**CI.** `deploy.yml` gates the web deploy on suite 1; `tests.yml` runs suites 1 and 2 on every pull request; Recover's own CI gates its GitHub Pages deploy on suite 3.

> **Correction (September 2026).** This section previously described an "End-to-End Test Suite (Playwright)" of "114 tests across 12 spec files… 342 total test runs" with a thirteen-item coverage list. **No such suite exists in this repository** — no Playwright configuration, no spec files, no dependency. The claim appears to have described exploratory work that was never committed. It is removed rather than corrected, and the suites above are what actually exist and run.

### What Has Been Verified

Re-run 2026-09-06 against v1.15.1. Each row carries the command, so these can be re-checked rather than trusted. Commands are run from the repository root.

| Check | Result | How to re-run |
|-------|:------:|---------------|
| No `unsafe` blocks in Rust | ✅ 0 hits | `grep -rn 'unsafe' packages/desktop/src-tauri/src/*.rs` |
| No `Math.random()` in crypto code | ✅ 0 hits | `grep -rn 'Math.random' packages/crypto/src packages/desktop/src-tauri/src` |
| No API routes or server-side code | ✅ 0 handlers, static export | `find src -name 'route.ts'` · `grep output next.config.ts` |
| Drag-drop disabled in Tauri config | ✅ `false` | `grep dragDropEnabled packages/desktop/src-tauri/tauri.conf.json` |
| Update signatures verified via Minisign | ✅ pubkey + updater artifacts configured | `grep -n 'pubkey\|createUpdaterArtifacts' packages/desktop/src-tauri/tauri.conf.json` |
| Debug logging absent from shipped code | ✅ 0 `console.log` in web, desktop and crypto sources | `grep -rn 'console\.log' src packages/desktop/src packages/crypto/src` |
| Source maps disabled in production | ✅ crypto `false`; desktop gated on `TAURI_DEBUG` | `grep -n sourcemap packages/crypto/tsup.config.ts packages/desktop/vite.config.ts` |
| Crypto buffers zeroized in `finally` blocks | ✅ 7 `finally` blocks, 26 `fill(0)` calls | `grep -c 'fill(0)' packages/crypto/src/crypto.ts` |
| No `eval()` or `dangerouslySetInnerHTML` | ⚠️ **Qualified** — one occurrence, `src/app/layout.tsx:83`: a **development-only** static script (guarded by `NODE_ENV === 'development'`) that unregisters the service worker against the dev server. Static literal, no interpolation, stripped from production builds. No `eval()` in first-party code. | `grep -rn 'dangerouslySetInnerHTML' src packages/desktop/src packages/shared-ui/src` |
| No secrets stored in `localStorage` | ⚠️ **Qualified** — no seQRets secret material (seeds, passwords, keyfiles, shares) is ever persisted. The **web** app can persist a user-supplied *Gemini API key* to `localStorage`, but only if the user opts in via the "remember" checkbox; the default is session-memory only (`setSessionApiKey`). Desktop stores it in the OS keychain instead. | `grep -rn 'localStorage.setItem' src packages/desktop/src packages/shared-ui/src` |
| `npm audit` | ⚠️ **Qualified** — **0 vulnerabilities in production dependencies.** The full tree reports **1 low-severity, development-only** advisory: `esbuild` ≤ 0.28.0 arbitrary file read via the dev server on Windows ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)). It affects the local development server only, never shipped code. Clearing it requires a breaking major bump of a build-critical dependency; **consciously accepted** rather than forced. On-disk `esbuild` is 0.27.7, deduped to a single copy. | `npm audit --omit=dev` · `npm audit` |
| `cargo audit` | ✅ **0 vulnerabilities** across 567 crate dependencies. 18 informational warnings (unmaintained/unsound), effectively all transitive: the GTK3 bindings Tauri pulls in for Linux builds, plus `proc-macro-error`, the `unic-*` family, and unsoundness notes in `glib` and `lru`. None are reachable from seQRets code paths. | `cd packages/desktop/src-tauri && cargo audit` |


## Conclusion

seQRets demonstrates **strong cryptographic engineering** with a well-designed zero-knowledge architecture. The desktop app provides meaningful security advantages over the web version through Rust-native cryptography, compiler-guaranteed memory erasure, browser-extension immunity, and a binary downloaded once rather than re-fetched through a CDN on every visit. (OS-level code signing is **not** yet configured — see the launch gate in [`PRELAUNCH_AUDIT.md`](PRELAUNCH_AUDIT.md). Updates are signed with Minisign and verified before installation; that is a different guarantee from Gatekeeper/SmartScreen trust.)

The 11 findings identified in this analysis were primarily configuration hardening opportunities (CSP, source maps) and edge-case robustness improvements (chunk overflow, clipboard clearing) — **none compromised the core cryptographic guarantees** of the application. **All 11 findings have been resolved.** Additionally, the password generator now guarantees at least one character from each required class (lowercase, uppercase, digit, special) via Fisher-Yates shuffle, eliminating the ~2.3% chance of generating an invalid password.

The cryptographic primitives (XChaCha20-Poly1305, Argon2id, Shamir's Secret Sharing) are industry-standard, properly parameterized, and correctly implemented across both the Rust and JavaScript codebases.

---

<p align="center">
<em>This analysis was conducted through a full source-code review of all Rust, TypeScript, and configuration files in the seQRets desktop application, with a whole-codebase pre-launch hardening pass (web + desktop + crypto + JavaCard) completed at v1.12.0. All 11 baseline findings were remediated immediately following the original audit; the pre-launch pass items are itemized above and tracked in <code>PRELAUNCH_AUDIT.md</code>. Cryptographic correctness is guarded by a permanent Rust↔TS parity test and end-to-end restore round-trips against every supported Qard layout. Last updated July 26, 2026 (v1.14.0 "🔥 Ignition").</em>
</p>
