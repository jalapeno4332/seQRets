
# seQRets: Crypto Inheritance That Actually Works

seQRets is a hyper-secure, open-source application designed to protect your most sensitive digital information—from crypto seed phrases and private keys to passwords and other confidential data. It uses a powerful cryptographic technique called Shamir's Secret Sharing to split your secret into multiple QR codes, which we call "Qards."

To restore your original secret, you must bring a specific number of these Qards back together. This method eliminates the single point of failure associated with storing secrets in one location, providing a robust solution for personal backup and inheritance planning.

## ⚠️ Disclaimer

**Your security is your responsibility.** This is not a toy. seQRets is a powerful tool that gives you full control over your digital assets. Misplacing your password or the required number of Qards can result in the **permanent loss** of your secret. The developers of seQRets have no access to your data, cannot recover your password, and cannot restore your secrets. Use this tool with a clear understanding of its function and manage your Qards and password with extreme care.

## ✨ Core Features

- **Shamir's Secret Sharing:** Split any text-based secret into a configurable number of Qards. You decide how many are needed for recovery.
- **Strong Encryption:** Your secret is encrypted on the client-side using **XChaCha20-Poly1305**. The encryption key is derived from your password and an optional keyfile using **Argon2id**, a memory-hard key derivation function.
- **Client-Side Security:** All cryptographic operations happen in your browser. Your raw secret and password are never sent to any server.
- **Optional Keyfile:** For enhanced security (a PRO feature), you can use any file as an additional "key." Both the password AND the keyfile are required for recovery.
- **Deadman's Switch (PRO):** Automatically send your encrypted vault to beneficiaries if you fail to check in within a specified time, ensuring your assets are passed on.
- **Cloud Backup (PRO):** Securely back up your encrypted Qards to your personal cloud vault, protected by your user account.

## 🚀 How to Use seQRets

The process follows a simple "Enter, Secure, Split" model.

| Encrypting a Secret (Enter, Secure, Split) | Decrypting a Secret |
| :--- | :--- |
| 1. **Enter:** Enter the secret you want to protect. | 1. **Upload / Scan:** Upload the required number of Qard images, scan them with your camera, or paste the raw text. |
| 2. **Secure:** Generate or enter a strong password, and optionally add a keyfile for extra security. | 2. **Enter Credentials:** Enter the password used for encryption and, if used, upload the original keyfile. |
| 3. **Split:** Choose your Qard configuration and download your backups. | 3. **Restore:** Click "Restore Secret" to reveal the original data. |

## 🔐 Security Features

The security of your data is the highest priority. Here’s a breakdown of the measures in place:

- **Client-Side Encryption:** Your data is encrypted in your browser before it is ever processed. The unencrypted secret never leaves your device.
- **Zero-Knowledge Architecture:** The server has no knowledge of your password or the content of your secrets. Saved vaults in the cloud contain only the encrypted shares.
- **Key Derivation (Argon2id):** We use Argon2id, the winner of the Password Hashing Competition, to make password cracking extremely difficult and costly for attackers.
- **Authenticated Encryption (XChaCha20-Poly1305):** This modern encryption standard ensures both the confidentiality and the integrity of your data, protecting it from tampering.
- **Secure Memory Wipe:** To protect against advanced threats, seQRets automatically overwrites sensitive data (like your secret and password) in the browser's memory with random data immediately after it has been used. This ensures your critical information persists for the shortest possible time.
- **Keyfile as a Second Factor:** Using a keyfile acts as a powerful form of two-factor authentication. An attacker would need your password, your Qards, *and* your keyfile.
- **No Single Point of Failure:** By splitting the secret, you are protected even if one of your Qards is lost or compromised.

### End-to-End Security Pipeline

Here is a detailed breakdown of the current workflow:

1.  **Seed Phrase Identification & Entropy Conversion (Optimization):**
    *   The app first checks if the input text is a valid BIP-39 mnemonic phrase (or multiple phrases concatenated).
    *   If it is, the phrase is converted back to its raw, binary **entropy**. This is a critical optimization. A 24-word phrase (e.g., ~150 characters) can be represented by just 32 bytes (256 bits) of entropy, which is then encoded into Base64 for efficient storage.
    *   This dramatically reduces the amount of data that needs to be processed in all subsequent steps, making QR codes much smaller and easier to scan.
    *   If the input is *not* a valid seed phrase, it is treated as a standard text secret.

2.  **Data Compression (Optimization):**
    *   The payload (either the compact binary entropy or the standard text secret) is packaged into a JSON object.
    *   This JSON object is then compressed using the **Gzip** algorithm. This further reduces the data size, especially for text-based secrets, making the resulting QR codes smaller and easier to scan.

3.  **Key Derivation (Enhanced Security):**
    *   The user's password (and optional keyfile) is fed into the **Argon2id** Key Derivation Function.
    *   The security parameters are set to a memory cost of **64MB** and a time cost of **4 iterations**, making brute-force attacks significantly more difficult and expensive for an attacker.
    *   This produces a strong 32-byte (256-bit) encryption key.

4.  **Authenticated Encryption:**
    *   The compressed data payload is encrypted using **XChaCha20-Poly1305**, a state-of-the-art standard that ensures both confidentiality and integrity, protecting against tampering.

5.  **Shamir's Secret Sharing (Splitting):**
    *   The final encrypted data blob is what gets split into the user-specified number of shares (e.g., 3-of-5).
    *   It's important to note that the raw secret is never split directly; only the fully encrypted data is.

This entire process happens client-side, in your browser, ensuring that your unencrypted secret and password are never sent to any server.

### Quantum Resistance: Password Generator

We calculated the time required for a quantum computer to brute force a seQRets-generated password using Grover's algorithm, which provides the optimal quantum speedup for this type of search.Based on our calculations, even a quantum computer using Grover's algorithm would require an astronomically long time to brute force your 32-character password.

**Password space**: With 88 possible characters (26 uppercase + 26 lowercase + 10 digits + 26 special characters), your 32-character password has approximately **10^62.22 possible combinations**.

**Quantum advantage**: Grover's algorithm provides the optimal quantum speedup for brute force attacks, reducing the search space from ~10^62 to ~**10^31.11 quantum operations**.

We calculated several scenarios for future fault-tolerant quantum computers:

**Extremely Optimistic Scenario:**
- 1 nanosecond per quantum gate
- 500 gates per Grover iteration  
- 10× error correction overhead
- **Result: ~2×10^18 years**

**Realistic Future Scenario:**
- 100 nanoseconds per gate
- 5,000 gates per iteration
- 1,000× error correction overhead  
- **Result: ~2×10^23 years**

Even the most optimistic estimate is **148 million times longer than the age of the universe** (13.8 billion years). The realistic estimate is **148 trillion times longer**.

#### Why the Password generator in seQRets Is Secure

Your password's security comes from:
1. **Large character set** (88 characters)
2. **Sufficient length** (32 characters) 
3. **True randomness** (cryptographically secure PRNG)
4. **Exponential scaling** - each additional character multiplies the search space by 88

This demonstrates why properly generated long passwords with high entropy remain secure even against theoretical future quantum computers. The mathematical foundations ensure security far beyond any practical timeline.

### Quantum Resistance: Argon2id + XChaCha20-Poly1305

#### How Argon2id "Protects" XChaCha20-Poly1305

In a typical implementation:

**Password → Argon2id KDF → Encryption Key → XChaCha20-Poly1305 → Encrypted Data**

Argon2id effectively becomes the **primary security barrier** because:

1. **Attack Path Priority**: An attacker will almost always target the KDF (password-based) rather than trying to break the encryption directly with an unknown key

2. **Quantum Security Chain**: 
   - Argon2id: Near-full quantum resistance due to memory-hardness
   - XChaCha20-Poly1305: 128-bit effective quantum security  
   - **Overall system quantum resistance ≈ Argon2id's resistance**

3. **Defense in Depth**: Even if an attacker somehow bypassed Argon2id and obtained the derived key, they'd still need to break XChacha20-Poly1305's 128-bit quantum security

#### Practical Security Implications

**Against Classical Attacks:**
- Argon2id's memory/time costs make password cracking extremely expensive
- XChaCha20-Poly1305 provides backup protection with 256-bit classical security

**Against Quantum Attacks:**
- Argon2id maintains strong resistance (memory-hardness challenges quantum computers)
- XChaCha20-Poly1305's 128-bit effective security remains robust
- The combination exceeds current post-quantum security standards

#### Real-World Example

Think of it like a bank vault:
- **Argon2id** = The massive, complex lock mechanism (hardest to defeat)
- **XChaCha20-Poly1305** = The vault door itself (still very strong)
- An attacker will focus on picking the lock rather than trying to cut through the door.

Argon2id's superior quantum resistance effectively elevates the entire system's security, making the combination more quantum-resistant than XChaCha20-Poly1305 alone would be.

## 💻 Local Setup Instructions

Follow these instructions to run the seQRets application on your local machine.

### Step 1: Prerequisites

- **Node.js:** Make sure you have Node.js installed. You can download it from [nodejs.org](https://nodejs.org/). Version 18 or later is required.
- **Firebase Project:** You will need a Google Firebase project to use features like user accounts and cloud storage. If you don't have one, you can create one for free at the [Firebase Console](https://console.firebase.google.com/).

### Step 2: Get the Code

1.  **Clone the Repository**
    Open your terminal or command prompt and run this command:
    ```bash
    git clone https://github.com/your-repo/seQRets.git
    ```
2.  **Navigate to the Directory**
    ```bash
    cd seQRets
    ```
3.  **Install Dependencies**
    This will download all the necessary packages for the app to run.
    ```bash
    npm install
    ```

### Step 3: Configure Environment Variables

This is the most important step for connecting the app to Firebase and other services.

1.  **Create the Environment File**
    In the main `seQRets` folder, create a new file named `.env`.

2.  **Add API Keys**
    You will need to get several keys from your Firebase project and add them to your new `.env` file. Open the file in a text editor and copy/paste the following content into it:

    ```
    # Firebase Client Keys (for browser-side connection)
    NEXT_PUBLIC_FIREBASE_API_KEY=
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
    NEXT_PUBLIC_FIREBASE_APP_ID=

    # Firebase Admin Keys (for server-side functions)
    FIREBASE_CLIENT_EMAIL=
    FIREBASE_PRIVATE_KEY=

    # Gemini API Key (for the "Ask Bob" AI Assistant)
    GEMINI_API_KEY=
    ```

    **Important Note:** The app's core encryption and decryption features work entirely offline. If you don't add these keys, the app will still run, but user accounts, cloud vaults, and the AI assistant will not be available.

### Step 4: Find and Add Your Keys

#### A. Firebase Client Keys (Browser)

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and select your project.
2.  Click the **gear icon** ⚙️ next to "Project Overview" in the top-left, then select **Project settings**.
3.  Under the "General" tab, scroll down to the "Your apps" section.
4.  Click on the name of your web app (or create one if you haven't).
5.  You will see a code snippet with your `firebaseConfig`. Copy the values from there and paste them into the corresponding `NEXT_PUBLIC_...` fields in your `.env` file.

#### B. Firebase Admin Keys (Server)

1.  In your Firebase **Project settings**, go to the **Service accounts** tab.
2.  Click the **Generate new private key** button. A warning will appear; click **Generate key** to confirm.
3.  A JSON file will download to your computer. Open this file with a text editor.
4.  Copy the value of `"client_email"` and paste it into the `FIREBASE_CLIENT_EMAIL` field in your `.env` file.
5.  Copy the entire value of `"private_key"`, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts. Paste this into the `FIREBASE_PRIVATE_KEY` field.

    > **CRITICAL:** The private key in the JSON file has multiple lines. When you paste it into the `.env` file, it must be on a single line with `\n` representing the line breaks.
    >
    > **Example:**
    > Your key will look like this in the JSON file:
    > `"-----BEGIN PRIVATE KEY-----\nABCDE...\n...XYZ\n-----END PRIVATE KEY-----\n"`
    > Make sure it looks exactly like that (all on one line) in your `.env` file.

#### C. Google Gemini Key (AI Assistant)

1.  Go to [Google AI Studio](https://aistudio.google.com/app/apikey) to create an API key.
2.  Copy your new API key and paste it into the `GEMINI_API_KEY` field in your `.env` file.

### Step 5: Run the App

You're all set! Run the following command in your terminal to start the development server:

```bash
npm run dev
```

The application should now be running at [http://localhost:9002](http://localhost:9002).

## 🤝 Contributing

This project is open-source. Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request on our GitHub repository.
