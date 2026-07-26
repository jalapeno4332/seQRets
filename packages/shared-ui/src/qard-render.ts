'use client';

/**
 * Shared Qard rendering / packaging core (G4).
 *
 * Everything here is pure with respect to the app: no React, no toasts, no
 * saving. The platform components own state, JSX, print windows, and how
 * bytes reach disk (browser anchor vs Tauri native-save); this module owns
 * WHAT gets generated so fixes land on web and desktop at once.
 *
 * Intentional platform divergence is expressed through options:
 * - `fingerprint` (desktop premium): printing a truncated SHA-256 line
 *   switches the info block to the compact layout (label first, then a
 *   combined "Set: X · date" line). Without it the classic layout renders
 *   (Set, label, Created on separate lines).
 * - `footerText` differs per platform by design.
 */

import JSZip from 'jszip';
import QRCode from 'qrcode';

/**
 * `seQRets-Qard-<sanitized-label->NN` — used for PNG/TXT/ZIP entry names.
 *
 * When no label is given (blind export) and a setId is available, the set ID
 * is used instead: `seQRets-Qard-<setId>-NN`. Without it, every set's files
 * would collide on identical generic names (and identical sizes, thanks to
 * payload padding). The set ID is safe to expose here — it is printed on the
 * card face even in blind mode and derivable from the share data itself.
 */
export function qardFileTitle(label: string | undefined | null, index: number, setId?: string | null): string {
  const disambiguator = label || setId || '';
  const sanitized = disambiguator ? `${disambiguator.replace(/[^a-zA-Z0-9_-]/g, '')}-` : '';
  return `seQRets-Qard-${sanitized}${String(index + 1).padStart(2, '0')}`;
}

/**
 * Generate QR data URLs for every share at M-level error correction
 * (~15% recovery) for stronger physical durability — important for
 * archival / inheritance use, where Qards may be stored for decades and
 * accumulate light damage. M is the floor; we fall back to L (~7%
 * recovery) per share only when the share is too large for M to encode at
 * QR version 40 (the QR spec ceiling).
 *
 * Validated against payloads up to ~450-char encrypted multi-sig
 * descriptors, including degraded photo-of-photo scan paths.
 */
export function generateQardQrUris(shares: string[]): Promise<(string | null)[]> {
  return Promise.all(
    shares.map(async (share) => {
      try {
        return await QRCode.toDataURL(share, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 800,
        });
      } catch (_) {
        try {
          const dataUrl = await QRCode.toDataURL(share, {
            errorCorrectionLevel: 'L',
            margin: 2,
            width: 800,
          });
          console.warn(`QR fell back to L for a ${share.length}-char share — M exceeded QR capacity.`);
          return dataUrl;
        } catch (errFallback) {
          console.error('QR generation failed at both M and L:', errFallback);
          return null;
        }
      }
    })
  );
}

export interface QardCardOptions {
  /** 1-based card number shown as "Qard #N". */
  cardNumber: number;
  setId: string;
  label?: string | null;
  /** Pre-formatted creation date (e.g. `new Date().toLocaleDateString('en-US')`). */
  dateStr: string;
  /**
   * Truncated SHA-256 fingerprint (premium). When present the compact
   * layout renders: optional label, combined "Set · date" line, then the
   * fingerprint. When absent the classic layout renders: Set, optional
   * label, "Created:" on separate lines.
   */
  fingerprint?: string | null;
  /** Footer line under the warning (differs per platform by design). */
  footerText: string;
  /** Canvas supersampling factor (default 4). */
  scale?: number;
}

/**
 * Pure Canvas 2D renderer for the Qard card layout.
 * Draws the full "Secret Qard Backup" card programmatically without
 * html2canvas, ensuring reliable cross-browser support (including Safari).
 */
export function renderQardToCanvas(qrDataUrl: string, opts: QardCardOptions): Promise<string> {
  const { cardNumber, setId, label, dateStr, fingerprint, footerText, scale = 4 } = opts;
  return new Promise((resolve, reject) => {
    // A5 dimensions at ~96 DPI
    const W = 560;
    const H = 794;

    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('Canvas 2d context unavailable')); return; }

    ctx.scale(scale, scale);

    // ── Background ──
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, W, H);

    // ── Outer border ──
    ctx.strokeStyle = '#d3cdc1';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // ── Title ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#231f20';
    ctx.font = 'bold 24px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('Secret Qard Backup', W / 2, 85);

    // ── QR Code ──
    const qrImgSize = 378; // ~10cm at 96 DPI
    const qrPad = 10;
    const qrBorder = 1;
    const qrBoxSize = qrImgSize + (qrPad + qrBorder) * 2;
    const qrBoxX = (W - qrBoxSize) / 2;
    const qrBoxY = 140;

    // QR border box
    ctx.strokeStyle = '#d3cdc1';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrBoxX + 0.5, qrBoxY + 0.5, qrBoxSize - 1, qrBoxSize - 1);

    // White background inside QR box
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrBoxX + qrBorder, qrBoxY + qrBorder, qrBoxSize - qrBorder * 2, qrBoxSize - qrBorder * 2);

    // Load and draw the QR code image
    const qrImg = new window.Image();
    qrImg.onload = () => {
      // Nearest-neighbour scaling for crisp QR modules
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        qrImg,
        qrBoxX + qrBorder + qrPad,
        qrBoxY + qrBorder + qrPad,
        qrImgSize,
        qrImgSize,
      );
      ctx.imageSmoothingEnabled = true;

      // ── Bottom info section ──
      let y = qrBoxY + qrBoxSize + 30;

      // Qard #N
      ctx.fillStyle = '#231f20';
      ctx.font = 'bold 20px Inter, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Qard #${cardNumber}`, W / 2, y);
      y += 28;

      if (fingerprint) {
        // Compact layout (premium): label first, combined Set · date,
        // then the SHA-256 fingerprint for visual spot-checking.
        if (label) {
          ctx.fillStyle = '#3e3739';
          ctx.font = '14px Inter, system-ui, -apple-system, sans-serif';
          ctx.fillText(`Label: ${label}`, W / 2, y);
          y += 24;
        }

        ctx.fillStyle = '#3e3739';
        ctx.font = '14px Inter, system-ui, -apple-system, sans-serif';
        ctx.fillText(`Set: ${setId}  ·  ${dateStr}`, W / 2, y);
        y += 24;

        ctx.fillStyle = '#3e3739';
        ctx.font = '12px Inter, system-ui, -apple-system, sans-serif';
        ctx.fillText(`SHA-256: ${fingerprint}`, W / 2, y);
        y += 28;
      } else {
        // Classic layout: Set, optional label, Created — separate lines.
        ctx.fillStyle = '#6b6567';
        ctx.font = '14px Inter, system-ui, -apple-system, sans-serif';
        ctx.fillText(`Set: ${setId}`, W / 2, y);
        y += 24;

        ctx.fillStyle = '#3e3739';
        ctx.font = '14px Inter, system-ui, -apple-system, sans-serif';
        if (label) {
          ctx.fillText(`Label: ${label}`, W / 2, y);
          y += 22;
        }

        ctx.fillText(`Created: ${dateStr}`, W / 2, y);
        y += 30;
      }

      // Warning — emoji rendered larger than the text
      {
        const emoji = '⚠️';
        const text = ' Store securely and separately from other qards';
        const emojiFont = '20px Inter, system-ui, -apple-system, sans-serif';
        const textFont = '500 14px Inter, system-ui, -apple-system, sans-serif';

        ctx.font = emojiFont;
        const emojiW = ctx.measureText(emoji).width;
        ctx.font = textFont;
        const textW = ctx.measureText(text).width;

        const startX = (W - (emojiW + textW)) / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#DC2626';

        ctx.font = emojiFont;
        ctx.fillText(emoji, startX, y);

        ctx.font = textFont;
        ctx.fillText(text, startX + emojiW, y);

        ctx.textAlign = 'center';
      }
      y += 25;

      // Footer
      ctx.fillStyle = '#6b6567';
      ctx.font = '12px Inter, system-ui, -apple-system, sans-serif';
      ctx.fillText(footerText, W / 2, y);

      resolve(canvas.toDataURL('image/png'));
    };
    qrImg.onerror = () => reject(new Error('Failed to load QR code image'));
    qrImg.src = qrDataUrl;
  });
}

/**
 * Assemble the "Download All" ZIP: one TXT per share, one card PNG per
 * share when available, plus the encrypted-instructions JSON if present.
 * Returns the JSZip instance; the caller picks the output type (blob for
 * browser download, uint8array for native save).
 */
export async function buildQardsZip(args: {
  shares: string[];
  label?: string | null;
  /** Used in entry names when label is absent (blind export) — see qardFileTitle. */
  setId?: string | null;
  /** Card PNG data URL per index, or null to skip (e.g. text-only mode). */
  getPngDataUrl: (index: number) => string | null | Promise<string | null>;
  encryptedInstructions?: unknown | null;
}): Promise<JSZip> {
  const { shares, label, setId, getPngDataUrl, encryptedInstructions } = args;
  const zip = new JSZip();

  for (let i = 0; i < shares.length; i++) {
    const title = qardFileTitle(label, i, setId);
    zip.file(`${title}.txt`, shares[i]);

    const pngDataUrl = await getPngDataUrl(i);
    if (pngDataUrl) {
      const base64Data = pngDataUrl.substring(pngDataUrl.indexOf(',') + 1);
      zip.file(`${title}.png`, base64Data, { base64: true });
    }
  }

  if (encryptedInstructions) {
    const instructionsContent = JSON.stringify(encryptedInstructions, null, 2);
    zip.file('seqrets-instructions.json', instructionsContent);
  }

  return zip;
}

/** Plaintext vault-file JSON (v1). Encryption, when requested, is applied by the platform. */
export function buildVaultJson(
  data: {
    label?: string | null;
    setId: string;
    shares: string[];
    requiredShares: number;
    totalShares: number;
    encryptedInstructions?: unknown | null;
  },
  keyfileUsed: boolean,
  createdAt: string = new Date().toISOString(),
): string {
  const vaultData = {
    version: 1,
    label: data.label || 'Untitled',
    setId: data.setId,
    shares: data.shares,
    requiredShares: data.requiredShares,
    totalShares: data.totalShares,
    createdAt,
    encryptedInstructions: data.encryptedInstructions || null,
    keyfileUsed: keyfileUsed,
  };
  return JSON.stringify(vaultData, null, 2);
}
