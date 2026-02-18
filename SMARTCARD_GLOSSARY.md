# Smartcard Glossary for seQRets Developers

A plain-English reference for every acronym, model number, and protocol you'll
encounter when working with the seQRets JavaCard integration.

---

## 1. The Companies & Organizations

| Name | What it is |
|------|-----------|
| **NXP Semiconductors** | The **chip manufacturer** (Dutch company, formerly Philips Semiconductors). They design and fabricate the actual secure processor silicon inside the card. Think of them like Intel, but for smartcards. |
| **Oracle** | Created **Java Card** -- the programming language and runtime that runs on the chip. Oracle defines the specification; chip manufacturers like NXP implement it. |
| **GlobalPlatform (GP)** | An **industry consortium** (not a company) that publishes open standards for how smartcard applications are managed -- installed, deleted, updated, and secured. Think of it as the "app store rules" for smartcards. |

---

## 2. Hardware Terms

| Term | Full name | What it is |
|------|-----------|-----------|
| **SE** | Secure Element | The actual chip/processor embedded in the card. Tamper-resistant, with its own CPU, RAM, and persistent storage. It's the "brain" of the card. |
| **EEPROM** | Electrically Erasable Programmable Read-Only Memory | The chip's **permanent storage** -- where your applet code and data live. Survives power-off (non-volatile). Measured in kilobytes (e.g., 145 KB, 450 KB). |
| **Flash** | Flash Memory | Similar to EEPROM but uses a different storage technology. Newer cards (JCOP 4.5) use Flash instead of traditional EEPROM. Functionally the same from a developer's perspective -- it's the card's "hard drive." |
| **P71** | NXP P71 Secure Element | An older NXP chip model. Used in JCOP4 cards (J3R180, J3R200). |
| **P71D600** | NXP P71D600 Secure Element | The **newer revision** of the P71 chip. Used in JCOP 4.5 cards (J3R452). More memory, PUF support. |
| **SN100** | NXP SN100 Secure Element | NXP's **next-generation** embedded SE -- used inside phones, wearables, and IoT devices (JCOP5). Not available as a discrete purchasable card. |
| **PUF** | Physical Unclonable Function | A hardware security feature on newer chips (P71D600). Exploits manufacturing variations in silicon to create a unique, unclonable fingerprint for each chip. Provides hardware-level anti-cloning and anti-tampering. |
| **Dual Interface** | -- | A card that supports both **contact** (insert into reader slot) and **contactless** (NFC tap). Like a credit card you can tap or insert. |
| **Contact Interface** | -- | Communication via the gold pads on the card surface. Card must be physically inserted into a reader. Uses ISO 7816 protocol. |
| **Contactless Interface** | -- | Communication via NFC/RFID radio. Card is tapped against or held near a reader. Uses ISO 14443 protocol. |
| **ID-1** | ISO/IEC 7810 ID-1 | The standard **credit-card sized** form factor: 85.6 x 53.98 mm. This is the familiar card shape. |
| **SIM / 2FF / 3FF / 4FF** | Form Factor variants | Smaller card sizes used in phones: Mini-SIM, Micro-SIM, Nano-SIM. Relevant if you ever embed a secure element in a mobile device. |

---

## 3. Software Stack

Think of a smartcard like a tiny phone:

```
+---------------------------------------+
|  Your App (seQRets Applet)            |  <-- What you wrote (Java)
+---------------------------------------+
|  Java Card API (v3.0.4, 3.0.5, etc.) |  <-- Like the Android SDK
+---------------------------------------+
|  JCOP (Operating System)              |  <-- Like the Android OS
+---------------------------------------+
|  GlobalPlatform (Card Manager)        |  <-- Like the Play Store / app manager
+---------------------------------------+
|  NXP Hardware (P71 / P71D600 chip)    |  <-- Like the phone's processor
+---------------------------------------+
```

| Term | Full name | What it is |
|------|-----------|-----------|
| **Java Card** | -- | A **tiny subset of Java** designed to run on smartcards. No floating point, no strings, no garbage collection, no threads. Has its own versioning: 3.0.4, 3.0.5, 3.1.0, etc. Programs written for older versions run on newer cards (backward compatible). |
| **JCOP** | Java Card OpenPlatform | NXP's **operating system** for their smartcard chips. It implements both the Java Card spec and the GlobalPlatform spec. Versions: JCOP3, JCOP4, JCOP4.5, JCOP5. Each generation adds features and runs on newer hardware. |
| **GP** | GlobalPlatform | The **card management layer**. Handles: installing/deleting applets, managing security domains, authenticating the card issuer. Think of it as the "admin console" for the card. Versions: 2.2.1, 2.3, 2.3.1. |
| **Applet** | -- | A program that runs on the card. Written in Java Card, compiled to a `.cap` file, installed via GlobalPlatform. The seQRets applet is a storage applet that holds encrypted shares. |
| **AID** | Application Identifier | A unique byte sequence that identifies an applet on the card. Like a package name. The seQRets AID is `F0 53 51 52 54 53 01 00 00`. The card manager uses this to select which applet to talk to. |
| **CAP file** | Converted Applet file | The compiled, installable package for a Java Card applet. Built from `.java` source using the Java Card SDK. Analogous to an `.apk` file on Android. |
| **Security Domain** | -- | A GP concept: an isolated, keyed zone on the card that "owns" one or more applets. Controls who can install, delete, or update applets in that zone. The card always has an Issuer Security Domain (ISD) with master keys. |

---

## 4. MIFARE (Contactless Technology)

**MIFARE** is NXP's family of **contactless-only** card technologies. It is completely
separate from Java Card and runs independently on the same chip. Think of it as a
second personality living on the card that seQRets does not use.

| MIFARE Variant | What it is |
|----------------|-----------|
| **MIFARE Classic** | The original (1994). Simple, cheap, widely deployed in transit/access. Uses proprietary Crypto-1 encryption which has been **publicly broken** -- not secure. |
| **MIFARE Plus EV2** | A drop-in replacement for Classic with **AES encryption**. Fixes Classic's security problems while staying compatible with existing infrastructure. |
| **MIFARE DESFire EV3** | The premium variant. Full microprocessor, supports **AES + 3DES**, mutual authentication, encrypted comms, multiple applications on one card. Used in modern transit, payment, and access systems. "DES" = the encryption; "Fire" = Fast, Innovative, Reliable, Enhanced. |

### How it relates to the J3R452

The J3R452 chip can **emulate** MIFARE (DESFire EV3 or Plus EV2) over its
contactless interface. This means a single physical card could simultaneously be:

1. A **seQRets secure storage card** (via Java Card, contact interface)
2. A **building access badge** (via MIFARE DESFire emulation, contactless tap)

For seQRets, you can **completely ignore MIFARE**. Your applet communicates over the
contact interface via PC/SC. The MIFARE capability is just bonus functionality baked
into the chip that transit/access customers care about -- not you.

---

## 5. Communication Protocols

| Term | Full name | What it is |
|------|-----------|-----------|
| **APDU** | Application Protocol Data Unit | The **command/response format** for all smartcard communication. Every interaction is: send a command APDU (header + optional data), receive a response APDU (optional data + status word). Like an HTTP request/response, but binary. |
| **CLA** | Class byte | First byte of an APDU command. Indicates the type of command. `0x00` = ISO standard, `0x80` = proprietary (what seQRets uses). |
| **INS** | Instruction byte | Second byte of an APDU command. Identifies the specific operation. e.g., `0x01` = STORE_DATA, `0x02` = READ_DATA in the seQRets applet. |
| **P1, P2** | Parameter bytes 1 & 2 | Third and fourth bytes of an APDU command. Provide additional parameters. e.g., P1 = chunk index, P2 = last-chunk flag. |
| **Lc** | Length of command data | Tells the card how many bytes of data follow the header. |
| **Le** | Length of expected response | Tells the card how many response bytes you want back. |
| **SW1, SW2** | Status Word bytes | The two bytes at the end of every response. `90 00` = success. `69 82` = security not satisfied (PIN required). `6A 82` = file/applet not found. |
| **T=0** | Transmission protocol 0 | A byte-oriented, half-duplex communication protocol. Older, simpler. |
| **T=1** | Transmission protocol 1 | A block-oriented protocol. More robust, supports chaining. This is what seQRets uses (and what most modern cards prefer). |
| **PC/SC** | Personal Computer / Smart Card | The **standard API** that lets a computer talk to a card reader. Built into Windows, macOS, and Linux. The seQRets Tauri desktop app uses this via the Rust `pcsc` crate. |
| **IFSC** | Information Field Size for the Card | Maximum number of data bytes the card can receive in a single T=1 block. Typically 254 bytes. |

---

## 6. Security Protocols

| Term | Full name | What it is |
|------|-----------|-----------|
| **SCP02** | Secure Channel Protocol 02 | An **older** GlobalPlatform protocol for encrypting communication between the host computer and the card during administrative operations (installing applets, managing keys). Uses **Triple-DES (3DES)** encryption with a **fixed initialization vector (IV)** -- which is a known cryptographic weakness. An attacker who can observe traffic can potentially recover plaintext. **Deprecated** since GP v2.3.1 (April 2018). Still supported on older cards for backward compatibility, but should not be used for new deployments. |
| **SCP03** | Secure Channel Protocol 03 | The **current and recommended** GP secure channel protocol. Replaces SCP02. Uses **AES encryption** with a **randomly generated IV** and the "Encrypt-then-MAC" (EtM) construction, which is provably secure for both confidentiality and message integrity. Protects both directions: commands *to* the card and responses *from* the card are encrypted and authenticated. Used during applet installation and key management. All JCOP4+ cards support SCP03. The added cost is minimal: one extra block cipher operation per message and a 2-byte counter per session. |
| **CPLC** | Card Production Life Cycle | Factory-embedded metadata that identifies the chip manufacturer, IC type, fabrication date, and serial number. **Cannot be overwritten** by pre-personalization. Queried via GP GET DATA command (`00 CA 9F 7F`). Useful for identifying an unknown card's real hardware. |
| **ATR** | Answer To Reset | The **first data** a card sends when powered on. Contains protocol negotiation info and "historical bytes" that may identify the card/OS. Can be overwritten during pre-personalization (which is why your test card says "JTaxCoreV1" instead of its real chip identity). |
| **EAL** | Evaluation Assurance Level | A Common Criteria security certification rating. Ranges from EAL1 (lowest) to EAL7 (highest). JCOP 4.5 is certified **EAL 6+**, which is extremely high -- typically reserved for government/military use. |
| **FIPS 140-3** | Federal Information Processing Standard 140-3 | A US government standard for cryptographic module security. JCOP 4.5 on P71D600 has achieved FIPS 140-3 certification, meaning it meets federal requirements for protecting sensitive information. |
| **CC** | Common Criteria | An international standard (ISO/IEC 15408) for computer security certification. Cards are evaluated by accredited labs and assigned an EAL level. |

---

## 7. Decoding NXP Card Model Numbers

NXP uses a systematic naming convention:

```
J 3 R 452
| | |  |
| | |  +-- Storage indicator (roughly maps to EEPROM/Flash size)
| | +---- Generation letter: H = JCOP3, R = JCOP4/4.5
| +------ 3 = Dual interface capable
+-------- J = Java Card product line
```

### Card Model Comparison

| Model | JCOP Gen | Java Card | GP | Storage | Chip | PUF | SCP03 | Status |
|-------|---------|-----------|-----|---------|------|:---:|:-----:|--------|
| J3H145 | JCOP3 | 3.0.4 | 2.2.1 | ~110 KB | SmartMX2 | -- | -- | Legacy (2010s) |
| J3R150 | JCOP4 | 3.0.5 | 2.3 | ~150 KB | P71 | -- | Yes | Current |
| J3R180 | JCOP4 | 3.0.5 | 2.3 | ~180 KB | P71 | -- | Yes | Current |
| J3R200 | JCOP4 | 3.0.5 | 2.3 | ~200 KB | P71 | -- | Yes | Current |
| **J3R452** | **JCOP4.5** | **3.0.5** | **2.3.1** | **~450 KB** | **P71D600** | **Yes** | **Yes** | **Latest available** |

---

## 8. Cryptographic Terms (On-Card)

These refer to algorithms the card's hardware can accelerate natively:

| Term | Full name | What it is |
|------|-----------|-----------|
| **AES** | Advanced Encryption Standard | Symmetric block cipher. 128/192/256-bit keys. Used by SCP03 for secure channel communication. |
| **3DES / TDES** | Triple Data Encryption Standard | Older symmetric cipher. Used by SCP02 (deprecated). |
| **RSA** | Rivest-Shamir-Adleman | Asymmetric (public-key) algorithm. J3R452 supports up to 4096-bit RSA keys on-card. |
| **ECC** | Elliptic Curve Cryptography | Asymmetric crypto using elliptic curves. Shorter keys, faster than RSA. J3R452 supports up to 521-bit curves. |
| **ECDSA** | Elliptic Curve Digital Signature Algorithm | Signing algorithm using ECC. Used for digital signatures. |
| **ECDH** | Elliptic Curve Diffie-Hellman | Key agreement protocol using ECC. Two parties derive a shared secret without transmitting it. |
| **EdDSA / Ed25519** | Edwards-curve Digital Signature Algorithm | A modern, fast signature scheme. J3R452 supports this natively -- potentially useful for the challenge-response timelock feature. |
| **AEAD** | Authenticated Encryption with Associated Data | Encryption that also verifies integrity. seQRets uses XChaCha20-Poly1305 (an AEAD cipher) on the *host* side, not on-card. |

---

## 9. Development Tools

| Term | What it is |
|------|-----------|
| **GlobalPlatformPro (gp.jar)** | Command-line tool for managing cards: install/remove applets, query card info, manage keys. Already in `packages/javacard/lib/`. |
| **ant-javacard.jar** | Apache Ant build plugin for compiling Java Card applets into `.cap` files. Already in `packages/javacard/lib/`. |
| **Oracle Java Card SDK** | The official SDK from Oracle. Contains the Java Card API stubs, compiler tools, and simulator. Multiple versions in `packages/javacard/sdks/`. The project uses `jc304_kit`. |
| **pcsc (Rust crate)** | Rust bindings for the PC/SC API. Used by the seQRets Tauri backend to communicate with the card reader. |
| **pyscard** | Python bindings for PC/SC. Useful for quick card experiments (if your Python version supports it). |

---

## 10. seQRets-Specific Terms

| Term | What it is |
|------|-----------|
| **Qard** | A seQRets share encoded as a QR code image. Portmanteau of "QR" + "card." |
| **Vault file (.seqrets)** | A JSON file containing all shares + metadata. Can be unencrypted (v1) or password-protected (v2). |
| **setId** | First 8 characters of the base64 salt -- used to verify that shares belong to the same secret. |
| **Share format** | `seQRets\|<base64-salt>\|<base64-encrypted-share-data>` |
| **Applet AID** | `F0 53 51 52 54 53 01 00 00` -- the unique identifier for the seQRets applet on any card. |
| **CLA 0x80** | The proprietary class byte used by all seQRets APDU commands. |

---

## 11. Quick Reference: "Which version of what?"

When someone asks "what does this card support?", here's what matters:

| Question | Answer for J3R452 |
|----------|-------------------|
| What **Java Card** version? | 3.0.5 Classic |
| What **GlobalPlatform** version? | 2.3.1 |
| What **JCOP** version? | 4.5 |
| What **chip**? | NXP P71D600 |
| What **secure channel**? | SCP03 (AES-based, current standard) |
| What **security cert**? | Common Criteria EAL 6+, FIPS 140-3 |
| What **crypto on-card**? | AES, RSA-4096, ECC-521, ECDSA, ECDH, EdDSA Ed25519 |
| How much **storage**? | ~450 KB Flash |
| **Anti-cloning**? | Yes -- PUF (Physical Unclonable Function) |
| **MIFARE emulation**? | DESFire EV3 / Plus EV2 (not used by seQRets) |

---

*Last updated: 2026-02-17*
