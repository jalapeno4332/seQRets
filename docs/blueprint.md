# **App Name**: seQRets

## Core Features:

- Encryption & Splitting: Text encryption and splitting using Argon2id, xchacha20 and Shamir Secret Sharing.
- QR Code Generation: Generation of QR codes representing Shamir shares, styled for A5 paper printing.
- QR Code Scanning: QR code scanning to recover Shamir shares for decryption.
- File Upload: File upload and drag/drop support for digital QR code shares.
- High Entropy Password Tool: The tool generates a high-entropy password composed of 24 multi-characters to use in combination with the cryptographic function.
- Configurable Secret Sharing: A setting lets the user control the number of shares to be made, and how many will be needed to restore the secret.

## Style Guidelines:

- Background color: Dark, desaturated shade of yellow (#26241D) to ensure comfortable contrast for the light text and the visual emphasis of yellow accents. It reflects the somber aspect of data security, and ensures readability when in dark mode.
- Primary color: Vibrant yellow (#FFDA63) is chosen for its optimistic quality, representing data availability, plus high contrast and readability over a dark background.
- Accent color: Analogous yellow-orange color (#FFB347), is slightly desaturated for creating emphasis. Used for interactive elements and important actions.
- Font pairing: 'Space Grotesk' (sans-serif) for headers and 'Inter' (sans-serif) for body text. Note: currently only Google Fonts are supported.
- Use clear, simple icons, with outlines that follow the golden ratio.
- Follows a minimalist approach with clear sections and A5 proportions for the printing functions.