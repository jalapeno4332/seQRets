# Cryptographic Architecture & Threat Model

All cryptographic operations in seQRets run **entirely on your device**. Your secrets never leave your machine.

> 📂 **All cryptography lives in a single ~750-line file:** [`packages/crypto/src/crypto.ts`](../packages/crypto/src/crypto.ts). Reviewers and auditors: start there. The desktop app delegates the hot path (Argon2id + XChaCha20-Poly1305) to native Rust — see [`packages/desktop/src-tauri/src/crypto.rs`](../packages/desktop/src-tauri/src/crypto.rs). The crypto package's companion modules contain no encryption code: [`restore.ts`](../packages/crypto/src/restore.ts) holds share-metadata/SeedQR helpers and [`slip39.ts`](../packages/crypto/src/slip39.ts) holds validation-only SLIP-39 share detection (wordlist + RS1024 checksum).

## How seQRets Works

### 🔒 Securing a Secret

1. **Detect** — if your secret is a BIP-39 seed phrase, it is converted to compact binary entropy (e.g., 24 words → 32 bytes) before processing; Trezor-style SLIP-39 recovery shares are recognized and checksum-validated (a mistyped word is caught here), then kept as plain text
2. **Compress** — gzip (level 9) reduces the payload size to minimize QR code density
3. **Pad** — the compressed payload is zero-padded to 192-byte buckets so the encrypted output's size doesn't reveal the secret's size (see [Length Privacy](#length-privacy-payload-padding))
4. **Derive key** — your password + optional keyfile are run through Argon2id (64MB memory, 4 iterations) to produce a 256-bit encryption key
5. **Encrypt** — XChaCha20-Poly1305 encrypts the padded data using a randomly generated 128-bit salt and 192-bit nonce
6. **Split** — Shamir's Secret Sharing divides the ciphertext into N shares with a threshold of T (e.g., 2-of-3)
7. **Output** — each share is encoded as a QR code (Qard) carrying a `v=1` format-version marker; a Qard is computationally indistinguishable from random noise without the others

```
Secret → [BIP-39 optimize] → Compress → Pad (192B buckets) → Argon2id → Encrypt → Shamir Split → Qards
```

### 🔓 Restoring a Secret

1. **Gather** — scan or import at least T Qards (the threshold)
2. **Reconstruct** — Shamir's algorithm recombines the shares into the full ciphertext
3. **Derive key** — the same password + keyfile are run through Argon2id again, producing the identical key
4. **Decrypt** — XChaCha20-Poly1305 decrypts and authenticates the data; any tampering causes an immediate authentication failure
5. **Decompress** — gunzip restores the original bytes
6. **Output** — your original secret, exactly as entered

```
T Qards → Shamir Reconstruct → Argon2id → Decrypt + Verify → Decompress → Secret
```

## Optional Keyfile (Second Factor)

seQRets supports an optional **keyfile** as a second factor alongside the password. When used, both the password AND the keyfile are required to derive the encryption key — one without the other is useless.

### How it works

A keyfile is a **32-byte (256-bit) random value** generated from the OS CSPRNG (`crypto.getRandomValues`) and stored as base64. During key derivation, the keyfile bytes are appended to the password bytes, and the concatenated buffer is fed into Argon2id as the secret input:

```
argon2id(password_bytes || keyfile_bytes, salt, 64MB, 4 iters) → 256-bit key
```

The salt is still randomly generated per-operation, so two encryptions with the same password + keyfile pair produce different keys. Restoration requires the exact same password AND the exact same keyfile bytes — there is no "recovery mode" that accepts one without the other.

### Why it matters

- **Defense in depth** — an attacker who compromises your password (phishing, keylogger, shoulder-surf) still cannot decrypt without the keyfile
- **Physical/digital split** — store the keyfile on a different medium than the password (keyfile on a smart card, password memorized; or keyfile in a password manager, password on paper)
- **Brute-force resistance** — even a weak password becomes computationally infeasible to guess when concatenated with 256 bits of unknown random data
- **Coercion resistance** — if the keyfile is stored somewhere you cannot physically reach (safe deposit box, another jurisdiction, a trusted party), you genuinely cannot decrypt on demand. See [Threats Mitigated by the Optional Keyfile](#threats-mitigated-by-the-optional-keyfile) for a full breakdown.

### Storage and distribution

- **Download** — save as a `.bin` file to any location (USB, encrypted drive, printed as a QR code, etc.)
- **Smart card** (desktop only) — write to a JavaCard alongside shares, vaults, or inheritance plans; load from the card anywhere a keyfile is accepted
- **Generate or upload** — create a fresh keyfile with the built-in generator, or bring your own

### Operational caveats

- **Losing the keyfile = losing the secret.** There is no recovery path. Treat the keyfile with the same care as a hardware wallet seed — back it up to multiple locations.
- **Keyfile ≠ password.** The keyfile does not replace the password; both are required. Do not reuse the same keyfile across unrelated secrets unless you want them to share the same second factor.
- **Keyfile bytes are zeroized after use** on both platforms (`fill(0)` on web, Rust `zeroize` on desktop).

## Primitives

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| **Key Derivation** | Argon2id (64MB memory, 4 iterations, 32-byte key output) | Derive encryption key from password + optional keyfile |
| **Encryption** | XChaCha20-Poly1305 (AEAD) | Authenticated encryption with integrity verification |
| **Salt** | 16 random bytes (per operation) | Unique salt for each encryption — ensures distinct keys even with the same password |
| **Nonce** | 24 random bytes | Per-encryption nonce for XChaCha20 |
| **Splitting** | Shamir's Secret Sharing ([audited](https://github.com/privy-io/shamir-secret-sharing), zero-dependency) | Threshold-based secret splitting into Qards |
| **Compression** | Gzip (level 9) | Reduce payload size before encryption |
| **RNG** | OS-backed CSPRNG | **Desktop:** Rust `rand::thread_rng()` (OS entropy) for salts/nonces; `crypto.getRandomValues()` for passwords/keyfiles. **Web:** `crypto.getRandomValues()` for all operations. |
| **Memory** | Key zeroization | **Desktop:** Rust `zeroize` crate — compiler-fence guaranteed, optimizer-proof. Keys never cross the JS/Rust boundary. **Web:** `fill(0)` in `finally` blocks. Note: JS strings (passwords) cannot be zeroed — a browser/JS limitation. |

## Encrypt-First Architecture (Security by Design)

seQRets deliberately **encrypts first, then splits** — this ordering is a critical security choice:

```
Secret → Compress (gzip) → Encrypt (XChaCha20-Poly1305) → Split (Shamir's) → Distribute
```

Each Qard contains a fragment of the **encrypted** ciphertext — never raw plaintext. To recover the secret, an attacker must:

1. **Obtain** the required threshold of Qards (e.g., 2-of-3), AND
2. **Know** the password (+ keyfile, if used)

These are **layered defenses** — both must be defeated. The alternative design (split first, then encrypt each share individually) is weaker: each share becomes an independent encryption target, and cracking the password on a single share could reveal partial plaintext. With Encrypt→Split, a stolen Qard is computationally indistinguishable from random noise.

## Quantum Resistance

**The seQRets scheme is quantum-resistant under its own assumptions.** While fewer than K shares are in an adversary's possession, the ciphertext is never reconstructed — so no quantum (or classical) attack has anything to attack in the first place.

### The scheme-level argument

Shamir's Secret Sharing is **information-theoretically secure**: with K-1 or fewer shares, an adversary has literally zero bits of information about the secret. This is not a computational assumption that a faster computer can break — it is a mathematical property of polynomial interpolation over finite fields. No quantum computer changes this. Grover's algorithm doesn't apply, Shor's algorithm doesn't apply, and no future quantum breakthrough can apply, because there is no hidden structure to exploit.

Because the ciphertext is only reconstructable once the threshold is met, the XChaCha20-Poly1305 layer is never attacked at all under the primary threat model (< K shares compromised). Its quantum vulnerability is irrelevant in that regime.

### XChaCha20-Poly1305 as defense-in-depth

The only scenario in which the symmetric cipher's quantum resistance matters is **after scheme failure** — i.e., an attacker has already obtained ≥ K shares and can reconstruct the ciphertext. That scenario represents a failure of the share distribution, not a failure of the cryptography. Even in that failure mode, the cipher layer continues to provide post-quantum security margin:

- **XChaCha20-Poly1305** — 256-bit key provides ~128-bit effective post-quantum security under Grover's algorithm
- **Argon2id** — memory-hardness (64 MB, 4 iterations) further raises the cost of brute-forcing the password
- **Password entropy** — the built-in generator produces passwords with ~10^62 possible combinations, putting Grover-accelerated brute-force beyond any realistic attacker:
  - **Optimistic estimate:** ~2 × 10^18 years (148 million × the age of the universe)
  - **Realistic estimate:** ~2 × 10^23 years (148 trillion × the age of the universe)

### Honest framing

seQRets is not "fully post-quantum secure in all scenarios." The honest framing is:

- ✅ **Scheme intact (< K shares compromised)** → quantum-resistant by information-theoretic argument, independent of any computational assumption
- ⚠️ **Scheme failed (≥ K shares compromised)** → falls back to XChaCha20-Poly1305 + Argon2id, which provides ~128-bit post-quantum security margin as defense-in-depth

If the share distribution is designed correctly, the second scenario should never occur in practice.

## Random Number Generation (CSPRNG)

All randomness in seQRets is sourced from a **Cryptographically Secure Pseudo-Random Number Generator (CSPRNG)** — the Web Crypto API's `crypto.getRandomValues()`, which draws from the operating system's entropy pool (`/dev/urandom` on Linux/macOS, `BCryptGenRandom` on Windows).

| Operation | Entropy | Method |
|-----------|---------|--------|
| **Seed phrase (12 words)** | 128 bits | `@scure/bip39` → `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |
| **Seed phrase (24 words)** | 256 bits | `@scure/bip39` → `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |
| **Password generation** | 32 × 32-bit values | `window.crypto.getRandomValues(new Uint32Array(32))` mapped to 88-char charset |
| **Keyfile generation** | 256 bits | `window.crypto.getRandomValues(new Uint8Array(32))` |
| **Encryption salt** | 128 bits (16 bytes) | Desktop: Rust `rand::thread_rng()` → OS entropy; Web: `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |
| **Encryption nonce** | 192 bits (24 bytes) | Desktop: Rust `rand::thread_rng()` → OS entropy; Web: `@noble/hashes randomBytes()` → `crypto.getRandomValues()` |

No `Math.random()` or any other weak PRNG is used for any security-critical operation.

## BIP-39 Optimization

Seed phrases are automatically detected and converted to compact binary entropy before encryption. A 24-word phrase (~150 characters) becomes just 32 bytes, dramatically reducing QR code size.

## Length Privacy (Payload Padding)

Encryption hides *what* data says, not *how much* of it there is: XChaCha20-Poly1305 is length-preserving, and every Shamir share is full-ciphertext length. Without countermeasures, a single Qard would reveal the approximate size of the secret — enough to distinguish a 12-word from a 24-word seed phrase, or a seed from a letter to heirs.

Since v1.14, the compressed payload is zero-padded up to multiples of **192 bytes** before encryption. Every common secret (12/24-word seeds, with or without a label) lands in the same first bucket, so an observer holding a Qard learns only "at most N buckets" — for typical secrets, nothing at all. The padding is applied after compression (compression would collapse it), covered by the authentication tag, and removed implicitly on restore: gzip streams are self-terminating and both deployed decompressors ignore trailing zero bytes, which is also why **pre-v1.14 apps and old `recover.html` copies restore padded Qards without modification**.

Every v1.14+ Qard also carries a `v=1` **format-version marker**, hash-covered like the rest of the metadata. Its purpose is longevity: Qards are frozen artifacts (printed cards, steel plates), and a version marker lets future software distinguish "this backup is damaged" (checksum mismatch) from "this software predates this Qard's format" (a clear update-your-app error). Shares without a `v=` segment are pre-v1.14 and parse under the original rules; padding applies to Qard share payloads only (vault and plan files are updatable disk artifacts).

## SLIP-39 Detection

Trezor-style SLIP-39 recovery shares (20 or 33 words, including multi-share sets entered one per line) are recognized on entry and validated against their built-in RS1024 checksum — any single mistyped word is caught before encryption, and the checksum is verified again after restore. Unlike BIP-39, SLIP-39 phrases are **stored as plain text** rather than converted to entropy: each share carries metadata (identifier, group parameters, iteration exponent) that must be reproduced exactly, and gzip already compresses share sets efficiently, so conversion would add share-format risk for negligible size benefit. The detection module ([`slip39.ts`](../packages/crypto/src/slip39.ts)) is validation-only — it embeds the official 1024-word wordlist verbatim, adds zero dependencies, is verified against all 45 official SatoshiLabs test vectors, and never splits, combines, or otherwise handles key material. No SeedQR is offered for SLIP-39 (SeedQR is a BIP-39-only format); restored shares display as a numbered word grid for typing into a hardware wallet.

---

# Threat Model

seQRets is transparent about its threat model. This section describes the known security properties and limitations of both the web and desktop apps so users can make informed decisions about what to protect and how.

## Web App

Both the secret input and password fields are **masked by default** with reveal-toggle controls, which mitigates casual shoulder surfing and incidental screen capture during normal use.

| Threat | Status | Notes |
|--------|--------|-------|
| **Browser extensions** | ⚠️ Unmitigated | The most serious realistic threat. A malicious or compromised extension runs in the same browser context and can read the DOM, intercept keystrokes, and access clipboard data regardless of field masking — extensions operate at higher privilege than the page. |
| **JS string memory** | ⚠️ Partial | Derived keys and byte buffers are zeroed via `fill(0)` in `finally` blocks. JS strings (your password) cannot be zeroed — they persist in the V8 heap until garbage collection, which may never happen within a session. |
| **Screen recording** | ⚠️ Partial | Both secret and password fields are masked by default. The risk surface is the reveal toggle — when the eye icon is clicked, the secret is briefly visible on screen. A keylogger is unaffected by masking. |
| **CDN / supply chain** | ⚠️ Per-load risk | JavaScript is served from GitHub Pages via a Cloudflare proxy (app.seqrets.app) that enforces HTTPS and security headers. A compromise at either layer could serve tampered code before load. Going offline after the page loads mitigates mid-session swaps. |
| **Clipboard** | ⚠️ OS-shared | Pasted content is readable by any focused app and may linger in clipboard history tools. |
| **Constant-time operations** | ⚠️ No guarantee | Browser JS has no constant-time execution guarantee. Timing side channels in comparison operations are theoretically possible, though difficult to exploit remotely. |
| **Spectre / shared memory** | ℹ️ Browser-mitigated | Modern browsers use site isolation, but shared renderer process memory between tabs remains a known attack class. |

### Running Offline After Load

Disconnecting from the network after the page has loaded provides limited but real protection:

**Genuinely mitigated:**
- CDN tampering for that session — the JS is already parsed and running; a server-side swap cannot affect you mid-session
- Accidental outbound data transmission (seQRets makes none by design, but offline adds a hard network-level guarantee)
- DNS-based redirects or injection after load

**Not mitigated:**
- Browser extensions — already running and network-independent; a malicious extension can store your secret locally and transmit it when you reconnect
- JS heap / string memory — offline changes nothing about V8 garbage collection
- Clipboard and screen recording — OS-level, not network-dependent
- Any malicious JS that was already loaded — it can queue exfiltration and fire it when connectivity is restored

## Quantum Attacks

The seQRets scheme is quantum-resistant under its own assumptions. The scheme's response to quantum attacks depends entirely on whether the share threshold has been breached.

| Threat | Status | Notes |
|---|---|---|
| **Quantum attack, scheme intact (< K shares compromised)** | ✓ Fully mitigated | Shamir's Secret Sharing is information-theoretically secure. With fewer than K shares, an adversary has literally zero bits of information about the secret — not "hard to compute", but mathematically absent. No quantum (or classical) algorithm can attack what does not exist. Grover's doesn't apply. Shor's doesn't apply. The ciphertext is never reconstructed, so XChaCha20-Poly1305 is never attacked at all in this regime. |
| **Quantum attack, scheme failed (≥ K shares compromised)** | ⚠️ Defense-in-depth | This scenario is a failure of share distribution, not of the cryptography, and lies outside the primary threat model. Even so, the cipher layer still provides post-quantum margin: XChaCha20-Poly1305's 256-bit key gives ~128-bit effective post-quantum security under Grover's algorithm, Argon2id (64 MB, 4 iterations) raises the brute-force cost, and the generator's 24+ character passwords (~10^62 combinations) put Grover-accelerated brute-force beyond any realistic attacker. |

### Honest framing

seQRets is not "fully post-quantum secure in all scenarios" — no honest scheme is. The correct framing:

- **Under the primary threat model** (share distribution working as designed), the scheme is quantum-resistant by an information-theoretic argument that is independent of any computational assumption.
- **Under scheme-failure conditions** (threshold compromised), XChaCha20-Poly1305 + Argon2id provide ~128-bit post-quantum defense-in-depth.

For the cryptographic derivation of why this holds, see [Quantum Resistance](#quantum-resistance).

## Threats Mitigated by the Optional Keyfile

A keyfile is a 32-byte random value that is concatenated with the password before key derivation (see [Optional Keyfile (Second Factor)](#optional-keyfile-second-factor) for the cryptographic details). Both the password AND the keyfile are required — one without the other is useless. This section describes the attack vectors a keyfile meaningfully changes.

### Password compromise becomes insufficient

Most realistic password-compromise vectors yield only the password, not the keyfile:

| Threat | Password only | Password + keyfile |
|---|---|---|
| **Keylogger** captures password as typed | ✗ Secret compromised | ✓ Attacker still needs the keyfile |
| **Shoulder-surf** of password entry | ✗ Secret compromised | ✓ Keyfile is binary, not typed |
| **Phishing** tricks user into revealing password | ✗ Secret compromised | ✓ Keyfile is a file, not a memorable string |
| **Password reuse breach** (another site leaks the same password) | ✗ Secret compromised | ✓ Leaked password is useless without the keyfile |
| **Acoustic / EM keystroke analysis** | ✗ Secret compromised | ✓ Keyfile isn't typed |
| **Brute-force / dictionary attack** against weak password | ✗ Eventually compromised | ✓ Adding 256 bits of unknown entropy makes brute-force infeasible regardless of password strength |
| **RAM/V8 heap forensics after a session** (web limitation) | ⚠️ Password may be recoverable from heap | ⚠️ Both would need to be recoverable; keyfile has no JS-string lifetime problem because it's loaded as bytes, not a string |

### Coercion and duress ("$5 wrench attack")

This is the most distinctive thing a keyfile buys you, and it only works if you **deliberately do not co-locate the keyfile with yourself**.

| Scenario | Password only | Password + keyfile (stored elsewhere) |
|---|---|---|
| **Physical coercion to decrypt on the spot** | ✗ You know the password — "I won't" is your only defense | ✓ You genuinely *cannot* decrypt; "I can't" is a factually true answer |
| **Border crossing — agent demands decryption** | ✗ You have to comply or refuse | ✓ Keyfile in a safe deposit box / other jurisdiction means compliance is physically impossible |
| **Traveling with crypto wealth** | ✗ Full access lives in your head | ✓ Leave the keyfile at home; you carry only half the factor |
| **Legal compulsion to produce a password** | ⚠️ Jurisdiction-dependent, but the password exists in your mind | ✓ You cannot be compelled to produce a file you don't physically possess |

The mechanism is simple: *"I cannot unlock this without a file I don't have on me"* is a verifiable statement, unlike *"I refuse to unlock this."* The former is factual, the latter is a choice the adversary can try to change.

### Not mitigated by a keyfile

A keyfile is not a magic bullet. These threats are unchanged or only marginally improved:

- **Both factors compromised simultaneously** — malware that reads files from disk AND logs keystrokes captures both
- **You are carrying the keyfile when attacked** — if the keyfile is on your laptop, phone, or USB stick on your person, the coercion defense evaporates
- **Physical access to the storage location** holding both factors — e.g., keyfile and password-containing notebook in the same drawer
- **Threshold reached on the Qard side** — if an attacker already has enough Qards AND both factors, the keyfile adds nothing
- **Loss of the keyfile** — there is no recovery path. Losing the keyfile is equivalent to losing the secret itself. This is the tradeoff for the coercion defense.

### Practical distribution patterns

Good keyfile storage patterns map to the threat you care about most:

- **Coercion defense** → keyfile in a bank safe deposit box, a trusted third party in another jurisdiction, or a smart card stored physically separate from the user
- **Password-compromise defense** → keyfile on a smart card or hardware token kept on the user's person, password memorized or in a password manager
- **Inheritance use case** → keyfile distributed as one of the Qards' physical artifacts (e.g., smart card at the attorney's office alongside the sealed instructions)

## Label Visibility

The optional label is stored **encrypted** inside the payload and reappears on restore. By default it is *also* printed in plain text on each Qard's face and used in PNG/TXT/ZIP/vault file names — convenient for sorting, but readable by anyone who handles a card or file (including a printing/etching service). The **"Show label on Qards & file names"** switch in the create flow turns this off ("blind export"): card faces show only the card number and set ID, files are named `seQRets-Qard-NN`, and on desktop, smart-card item labels are generic. The in-app help warns users not to put amounts, exchange names, or other sensitive hints in a label they intend to print.

## Review Reminder Sidecar

The desktop app offers an opt-in review reminder that nudges users to open and verify their inheritance plan on a 6/12/24 month cadence. To avoid requiring the user's password on every app launch just to check if a reminder is due, a small plaintext JSON sidecar (`review-reminder.json`) is stored in the Tauri app data directory alongside other local config.

**What the sidecar contains:**
- `nextReviewAt` — a future ISO date
- `lastReviewedAt` — the last time the user clicked "Mark as reviewed"
- `intervalMonths` — the user's chosen review interval
- `snoozedUntil` — a snooze date (if active)
- `enabled` — whether the reminder is active

**What the sidecar does NOT contain:**
- Plan contents (names, beneficiaries, secrets, passwords)
- Which plan it refers to (no file paths, hashes, or identifiers)
- Cryptographic material of any kind

**Accepted tradeoffs:**
- The sidecar reveals that the user has opted into review reminders and when the next review is scheduled. This is marginal — the encrypted plan file's existence already reveals far more (that the user has an inheritance plan).
- An attacker with write access to the app data dir can suppress, fake, or spam the reminder. This is accepted because the same attacker could modify the app binary, read the OS keychain, or watch the user type their password — defeating a plaintext reminder is the least of their capabilities.
- The sidecar is not tamper-proof. Its only integrity check is reconciliation: when the user opens the encrypted plan, the in-plan `lastReviewedAt` (authoritative) is compared against the sidecar. If they disagree by more than 30 days, the app warns the user.
- The sidecar is not synced across devices or backed up with the plan. On a new machine, it is rebuilt from the encrypted plan's `lastReviewedAt` with conservative defaults the first time the user decrypts.

**Privacy properties:**
- Opt-in, not opt-out. Users who decline leave only a minimal marker (`enabled: false`) that prevents re-prompting on every launch.
- Fully reversible. "Disable and delete" in the plan editor removes the file entirely.
- Local-only. Never transmitted, never read by any server.

## Desktop vs Web Comparison

| Threat | Web | Desktop |
|--------|-----|---------|
| **Browser extension attack surface** | ✗ Unmitigated | ✓ Tauri WebView runs without browser extensions |
| **JS string memory** | ✗ Password persists in V8 heap | ⚠️ Password transits JS heap via IPC, but derived key stays entirely in Rust |
| **Key zeroization** | ⚠️ `fill(0)` — optimizer may elide | ✓ Rust `zeroize` crate — compiler-fence guaranteed |
| **CDN / supply chain** | ✗ Per-load risk | ✓ Official release is code-signed with integrity verified at install |
| **Constant-time operations** | ✗ No guarantee | ✓ Rust crypto crates are constant-time by design |
| **Clipboard** | ✗ OS-shared | ✗ Same |
| **Screen recording** | ⚠️ Partial (masked by default) | ⚠️ Same |

The two most impactful threats — browser extensions and JS memory — are both substantially closed by the desktop app. The remaining risks (clipboard, screen recording) are OS-level and cannot be fully solved by any software.

> ⚠️ **Self-built binaries are not code-signed.** The CDN/supply-chain protections in the table above apply only to the official signed release. If you compile from source, you are responsible for verifying the integrity of your own build. Self-built binaries will trigger OS gatekeeper warnings and do not receive automatic updates.

> **Bottom line:** The web app is appropriate for users who understand the threat model, use a clean browser profile with no untrusted extensions, and are comfortable with client-side-only JavaScript cryptography. For maximum security — especially for high-value seed phrases — use the desktop app.
