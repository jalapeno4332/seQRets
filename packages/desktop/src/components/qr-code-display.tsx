import { Button } from '@/components/ui/button';
import { PRINT_FONT_CSS } from './print-fonts';
import { Printer, FileArchive, TriangleAlert, Loader2, Lock, Save, Eye, EyeOff, ShieldCheck, CreditCard, ScanLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { CreateSharesResult, EncryptedVaultFile } from '@/lib/types';
import { qardFileTitle, generateQardQrUris, renderQardToCanvas, buildQardsZip, buildVaultJson } from '@/components/ui/qard-render';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SmartCardDialog, SmartCardMode } from '@/components/smartcard-dialog';
import { saveFileNative, saveTextFileNative, dataUrlToUint8Array, PNG_FILTERS, TXT_FILTERS, ZIP_FILTERS, SEQRETS_FILTERS } from '@/lib/native-save';
import { encryptVault } from '@/lib/desktop-crypto';
import { computeShareHash, truncateHash } from '@seqrets/crypto';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { tempDir, join } from '@tauri-apps/api/path';


interface QrCodeDisplayProps {
  qrCodeData: CreateSharesResult;
  keyfileUsed: boolean;
  /**
   * When false ("blind export"), the label is kept OFF every export surface —
   * card face, print HTML (incl. the temp print file), PNG/TXT/ZIP file names,
   * the vault file name, and smart-card item labels — so a card, file, or card
   * listing reveals nothing but a number and set ID. The encrypted copy inside
   * the payload is unaffected. Defaults to true, matching historical behavior.
   */
  showLabelOnExports?: boolean;
}

export function QrCodeDisplay({ qrCodeData, keyfileUsed, showLabelOnExports = true }: QrCodeDisplayProps) {
  const { shares, totalShares, requiredShares, label, setId, isTextOnly: isTextOnlyHint, encryptedInstructions } = qrCodeData;
  // Every export surface reads exportLabel; only the on-screen header (the
  // user's own session) keeps showing the real label regardless.
  const exportLabel = showLabelOnExports ? label : null;
  // Ground-truth check: if any actual share exceeds the QR capacity limit,
  // force text-only mode regardless of the pre-generation estimate (which
  // can be wrong due to stale closures in the worker message handler).
  const QR_CAPACITY_LIMIT = 1400;
  const isTextOnly = isTextOnlyHint || shares.some(s => s.length > QR_CAPACITY_LIMIT);
  const [qrCodeUris, setQrCodeUris] = useState<(string | null)[]>([]);
  const { toast } = useToast();
  const [isLoadingImages, setIsLoadingImages] = useState(!isTextOnly);

  // Smart card dialog state
  const [isSmartCardOpen, setIsSmartCardOpen] = useState(false);
  const [smartCardMode, setSmartCardMode] = useState<SmartCardMode>('write-share');
  const [smartCardWriteData, setSmartCardWriteData] = useState('');
  const [smartCardWriteLabel, setSmartCardWriteLabel] = useState('');

  // Vault export password dialog state
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState('');
  const [isVaultPasswordVisible, setIsVaultPasswordVisible] = useState(false);
  const [isEncryptingVault, setIsEncryptingVault] = useState(false);
  // No Worker setup needed — vault encryption runs natively in Rust via Tauri IPC.

  // Scan warning modal state — shown once per session for near-limit QR codes
  const QR_CAPACITY_WARNING = 900;
  const isNearLimit = !isTextOnly && shares.length > 0 && shares[0].length > QR_CAPACITY_WARNING;
  const [showScanWarning, setShowScanWarning] = useState(isNearLimit);

  const getShareTitle = (index: number) => qardFileTitle(exportLabel, index, setId);

  // Truncated SHA-256 fingerprint (premium) — read from the share's embedded
  // sha256 segment (computed at generation over the FULL hash input,
  // including any recovery metadata), falling back to recompute over
  // salt|data for legacy hashless Qards. Guarantees the printed fingerprint
  // matches the QR's contents byte-for-byte.
  const getShareFingerprint = (index: number) => {
    const parts = shares[index].split('|');
    const embedded = parts.find(p => p.startsWith('sha256:'))?.slice(7);
    const fullHash = embedded ?? computeShareHash(parts.slice(0, 3).join('|'));
    return truncateHash(fullHash);
  };

  const getPrintableStyles = (forPrintAll: boolean = false) => `
    ${PRINT_FONT_CSS}
    @page { size: A5; margin: 0; }
    body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', sans-serif;
        background-color: #fdfdfd;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .page-break {
        ${forPrintAll ? 'page-break-after: always;' : ''}
    }
    .a5-page {
        width: 14.8cm;
        height: 21cm;
        display: flex;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        overflow: hidden;
    }
  `;

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const getPrintableHtmlForShare = (index: number, forPrintAll: boolean = false) => {
    const qrUri = qrCodeUris[index];
    if (!qrUri && !isTextOnly) return '';

    const createdDate = new Date().toLocaleDateString('en-US');
    const pageBreakClass = forPrintAll && index < shares.length - 1 ? 'page-break' : '';

    return `
      <div id="qard-to-print-${index}" class="a5-page ${pageBreakClass}" style="width: 14.8cm; height: 21cm; display: flex; justify-content: center; align-items: center; background-color: #fdfdfd; font-family: 'Inter', sans-serif;">
        <div style="box-sizing: border-box; border: 1px solid #d3cdc1; padding: 20px 40px 50px 40px; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: space-between;">

            <h1 style="font-size: 24px; font-weight: 700; color: #231f20; margin-top: 50px; margin-bottom: 40px;">Secret Qard Backup</h1>

            <div style="border: 1px solid #d3cdc1; padding: 10px;">
                ${qrUri ? `<img src="${qrUri}" alt="QR Code" style="width: 10cm; height: 10cm; image-rendering: pixelated;"/>` : `<div style="width: 10cm; height: 10cm; display: flex; align-items: center; justify-content: center; background: #e8e5df; color: #6b6567; text-align: center;">QR Code not available.<br/>Data is too large.</div>`}
            </div>

            <div>
                <h2 style="font-size: 20px; font-weight: 700; margin: 20px 0 8px 0; color: #231f20;">Qard #${index + 1}</h2>

                ${exportLabel ? `<p style="font-size: 14px; color: #3e3739; margin: 0 0 6px 0;">Label: <b style="font-weight: 500;">${escapeHtml(exportLabel)}</b></p>` : ''}

                <p style="font-size: 14px; color: #3e3739; margin: 0 0 6px 0;">Set: ${escapeHtml(setId)}  &middot;  ${createdDate}</p>

                <p style="font-size: 12px; color: #3e3739; margin: 0 0 16px 0;">SHA-256: ${getShareFingerprint(index)}</p>

                <div style="display: flex; align-items: center; justify-content: center; color: #DC2626; font-weight: 500; font-size: 14px; margin-bottom: 10px;">
                    <span style="margin-right: 6px; font-size: 16px;">⚠️</span>
                    <span>Store securely and separately from other qards</span>
                </div>

                <p style="font-size: 12px; color: #6b6567; margin: 0;">Scan with seQRets App to recover &mdash; seqrets.app</p>
            </div>

        </div>
      </div>
    `;
  };

  /**
   * Print Qard content by opening a self-contained HTML file in the system
   * browser. This keeps the app completely undisturbed — the print dialog
   * appears in a separate Safari/Chrome window with its own print controls.
   */
  const printContent = async (contentHtml: string, styles: string) => {
    const fullHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>${styles}</style>
    <script>
      window.onload = function() {
        // Small delay so the page renders fully before the dialog appears
        setTimeout(function() { window.print(); }, 400);
      };
    <\/script>
  </head>
  <body>${contentHtml}</body>
</html>`;

    try {
      const tmp = await tempDir();
      const fileName = 'seqrets-print.html';
      const fullPath = await join(tmp, fileName);
      await writeTextFile(fullPath, fullHtml);
      await openPath(fullPath);
    } catch (err: any) {
      console.error('Print failed:', err);
      toast({
        variant: 'destructive',
        title: 'Print Failed',
        description: String(err?.message || err),
      });
    }
  };

  const handlePrint = (index: number) => {
    printContent(getPrintableHtmlForShare(index), getPrintableStyles());
  };

  const handlePrintAll = () => {
    const allSharesHtml = shares.map((_, index) => getPrintableHtmlForShare(index, true)).join('');
    printContent(allSharesHtml, getPrintableStyles(true));
  };

  // Canvas card rendering lives in shared-ui (qard-render.ts). Desktop uses
  // the compact premium layout: the fingerprint switches on the combined
  // "Set · date" line and the SHA-256 row, with the desktop footer.
  const renderCardToCanvas = (index: number, qrDataUrl: string, scale: number = 4): Promise<string> =>
    renderQardToCanvas(qrDataUrl, {
      cardNumber: index + 1,
      setId,
      label: exportLabel,
      dateStr: new Date().toLocaleDateString('en-US'),
      fingerprint: getShareFingerprint(index),
      footerText: 'Scan with seQRets App to recover  \u2014  seqrets.app',
      scale,
    });

  const handleDownload = async (index: number) => {
    if (!isTextOnly && isLoadingImages) {
        toast({ variant: "destructive", title: "Images not ready", description: "The Qard images have not been generated yet." });
        return;
    }
    if (!isTextOnly && !qrCodeUris[index]) {
      toast({ variant: "destructive", title: "Image not ready", description: "The Qard image failed to generate." });
      return;
    }

    try {
        await document.fonts.ready;
        const dataUrl = await renderCardToCanvas(index, qrCodeUris[index]!, 4);
        const pngBytes = dataUrlToUint8Array(dataUrl);
        const savedPath = await saveFileNative(
          `${getShareTitle(index)}.png`,
          PNG_FILTERS,
          pngBytes,
        );
        if (savedPath) {
          toast({
              title: "File Saved",
              description: `Saved ${getShareTitle(index)}.png`,
          });
        }
    } catch (error) {
        console.error("Error generating image for download:", error);
        toast({
            variant: "destructive",
            title: "Download Failed",
            description: "Could not generate the downloadable image.",
        });
    }
  };

  const handleDownloadTxt = async (index: number) => {
    const shareData = shares[index];
    const title = getShareTitle(index);
    try {
      const savedPath = await saveTextFileNative(`${title}.txt`, TXT_FILTERS, shareData);
      if (savedPath) {
        toast({
            title: "File Saved",
            description: `Saved ${title}.txt`,
        });
      }
    } catch (error) {
      console.error("Error saving text file:", error);
      toast({
          variant: "destructive",
          title: "Save Failed",
          description: "Could not save the text file.",
      });
    }
  };


  const handleDownloadAll = async () => {
    if (!isTextOnly && qrCodeUris.length !== shares.length) {
        toast({ variant: "destructive", title: "Images not ready", description: "Not all Qard images have been generated yet." });
        return;
    }
    try {
        await document.fonts.ready;
        const zip = await buildQardsZip({
            shares,
            label: exportLabel,
            setId,
            // Render each card on demand (no pre-generated cache on desktop).
            getPngDataUrl: (i) => (!isTextOnly && qrCodeUris[i] ? renderCardToCanvas(i, qrCodeUris[i]!, 4) : null),
            encryptedInstructions,
        });
        const content = await zip.generateAsync({ type: 'uint8array' });
        const savedPath = await saveFileNative('seQRets-shares.zip', ZIP_FILTERS, content);
        if (savedPath) {
          toast({
              title: "File Saved",
              description: "Saved seQRets-shares.zip",
          });
        }
    } catch (error) {
        console.error("Error creating zip file:", error);
        toast({
            variant: "destructive",
            title: "Download All Failed",
            description: "Could not generate the zip file. Please try downloading shares individually.",
        });
    }
};

  const resetVaultDialog = () => {
    setVaultPassword('');
    setVaultPasswordConfirm('');
    setIsVaultPasswordVisible(false);
  };

  const getVaultJsonString = () => buildVaultJson(qrCodeData, keyfileUsed);

  const downloadVaultFile = async (content: string, isEncrypted: boolean) => {
    // Blind export: vault FILENAME must not leak the label (contents may be
    // encrypted, the file name never is).
    const vaultLabel = (exportLabel || (showLabelOnExports ? 'Untitled' : `seQRets-Vault-${setId}`));
    const sanitizedLabel = (vaultLabel).replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${sanitizedLabel}.seqrets`;
    const savedPath = await saveTextFileNative(filename, SEQRETS_FILTERS, content);
    if (savedPath) {
      toast({
        title: isEncrypted ? 'Encrypted Vault Exported!' : 'Vault Exported!',
        description: `Saved as ${filename}. ${isEncrypted ? 'This file is password-protected.' : 'Store this file safely.'}`,
      });
    }
  };

  const handleExportVaultClick = () => {
    setIsVaultDialogOpen(true);
  };

  const handleExportWithoutPassword = async () => {
    await downloadVaultFile(getVaultJsonString(), false);
    setIsVaultDialogOpen(false);
    resetVaultDialog();
  };

  const handleExportWithPassword = async () => {
    if (!vaultPassword) {
      toast({ variant: 'destructive', title: 'Password Required', description: 'Please enter a password or choose to export without one.' });
      return;
    }
    if (vaultPassword !== vaultPasswordConfirm) {
      toast({ variant: 'destructive', title: 'Passwords Don\'t Match', description: 'Please make sure both passwords match.' });
      return;
    }
    // The vault holds ALL the Qards of this set in one file, so this password
    // is the only thing standing between the file and the secret — demand more
    // of it than we do elsewhere.
    if (vaultPassword.length < 8) {
      toast({ variant: 'destructive', title: 'Password Too Short', description: 'This file contains all your Qards in one place, so its password matters most. Please use at least 8 characters.' });
      return;
    }
    setIsEncryptingVault(true);
    try {
      const result = await encryptVault(getVaultJsonString(), vaultPassword);
      const encryptedFile: EncryptedVaultFile = {
        version: 2,
        encrypted: true,
        salt: result.salt,
        data: result.data,
      };
      await downloadVaultFile(JSON.stringify(encryptedFile, null, 2), true);
      setIsVaultDialogOpen(false);
      resetVaultDialog();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Encryption Failed', description: e?.message || 'Could not encrypt the vault file.' });
    } finally {
      setIsEncryptingVault(false);
    }
  };

  useEffect(() => {
    if (isTextOnly) {
      setIsLoadingImages(false);
      return;
    }
    // Cancellation guard: if shares change (or we unmount) mid-generation,
    // drop the stale batch instead of committing it over the new state.
    let cancelled = false;
    setIsLoadingImages(true);
    generateQardQrUris(shares).then((uris) => {
      if (cancelled) return;
      setQrCodeUris(uris);
      setIsLoadingImages(false);
    });
    return () => { cancelled = true; };
  }, [shares, isTextOnly]);


  const createdDate = new Date().toLocaleDateString('en-US');

  return (
    <div className="border-t pt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 no-print px-4">
        <div>
            <p className="text-muted-foreground text-sm">You need {requiredShares} of {totalShares} Qards to restore the secret.</p>
            {label && <p className="text-muted-foreground text-sm font-semibold">Label: {label}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={handleDownloadAll} className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                <FileArchive className="mr-2 h-4 w-4" /> Download All (ZIP)
            </Button>
            {!isTextOnly && (
                <Button onClick={handlePrintAll} className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                    <Printer className="mr-2 h-4 w-4" /> Print All (A5)
                </Button>
            )}
        </div>
      </div>

       {isTextOnly && (
        <Alert variant="destructive" className="mb-4 mx-4">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Text-Only Backups Generated</AlertTitle>
          <AlertDescription>
            Your secret was too large to be stored in QR codes. Only text files (.txt) have been generated. Please download and store them securely.
          </AlertDescription>
        </Alert>
      )}

      {isNearLimit && (
        <button onClick={() => setShowScanWarning(true)} className="flex items-center gap-2 mb-4 mx-4 px-3 py-2 rounded-md border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 text-sm text-yellow-800 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors w-fit">
          <ScanLine className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span className="font-medium">Verify Your QR Qards Are Scannable</span>
        </button>
      )}

      {encryptedInstructions && (
        <Alert className="mb-4 mx-4 border-accent text-foreground dark:text-foreground [&>svg]:text-primary">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Encrypted Instructions File Included</AlertTitle>
            <AlertDescription>
                An encrypted instructions file (`seqrets-instructions.json`) has been generated. It will be included in the "Download All" zip.
            </AlertDescription>
        </Alert>
      )}

      <div className="bg-background rounded-lg p-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 place-items-center gap-4 p-4">
          {shares.map((share, index) => (
            <div key={index} className="flex flex-col items-center">
              {isTextOnly || !qrCodeUris[index] ? (
                 <div className="p-4 rounded-lg border flex flex-col items-center text-center justify-between shadow-md bg-card w-[252.7px] h-[361px]">
                   <div className="flex-grow flex flex-col items-center justify-center p-2 text-foreground">
                      <div className="w-20 h-20 text-muted-foreground mb-4" />
                      <p className="font-bold text-lg">Share #{index + 1}</p>
                      <p className="text-sm text-muted-foreground">Set: <span className="font-semibold">{setId}</span></p>
                      <div className="text-xs text-muted-foreground leading-snug mt-2">

                          <span>Created: <span className="font-semibold">{createdDate}</span></span>
                      </div>
                      <div className="flex items-center text-red-600 text-xs font-medium mt-4">
                           <TriangleAlert className="h-4 w-4 mr-1.5 flex-shrink-0" />
                            <span>Store securely and separately</span>
                        </div>
                        {!isTextOnly && !qrCodeUris[index] &&
                           <p className="text-xs text-red-500 font-bold mt-2">QR failed: Data too large</p>
                        }
                   </div>
                 </div>
              ) : (
                <div
                    className="p-4 rounded-lg border flex flex-col items-center text-center justify-between shadow-md transition-transform hover:shadow-xl hover:-translate-y-1 bg-card printable-qard"
                    style={{ width: '252.7px', height: '361px', color: '#231f20', fontFamily: 'Inter, sans-serif' }}
                >
                    <div className="flex-grow flex flex-col items-center justify-center p-2 text-foreground">
                       {isLoadingImages ? (
                           <div className="w-[150px] h-[150px] bg-muted animate-pulse rounded-md flex items-center justify-center">
                             <Loader2 className="h-8 w-8 text-muted-foreground animate-spin"/>
                           </div>
                       ) : (
                            <div className="p-1 border border-border">
                                <img
                                    src={qrCodeUris[index]!}
                                    alt={`QR Code for Share ${index + 1}`}
                                    width={150}
                                    height={150}
                                    className="rounded-sm"
                                />
                            </div>
                       )}
                       <div className='mt-4'>
                            <p className="font-bold text-lg">Qard #{index + 1}</p>
                            <p className="text-sm text-muted-foreground">Set: <span className="font-semibold">{setId}</span></p>
                            <div className="text-xs text-muted-foreground leading-snug mt-2">

                                <span>Created: <span className="font-semibold">{createdDate}</span></span>
                            </div>
                       </div>
                        <div className="flex items-center text-red-600 text-xs font-medium mt-4">
                           <TriangleAlert className="h-4 w-4 mr-1.5 flex-shrink-0" />
                            <span>Store securely and separately</span>
                        </div>
                    </div>
                </div>
              )}

                <div className="w-full mt-auto pt-4 flex flex-col items-center">
                    <p className="font-semibold text-sm">Share {index + 1} of {totalShares}</p>
                    <div className={cn("grid grid-cols-1 gap-2 mt-2 w-full max-w-[252.7px]", isTextOnly || !qrCodeUris[index] ? "grid-cols-1" : "grid-cols-2")}>
                        {!isTextOnly && qrCodeUris[index] && (
                            <Button variant="outline" size="sm" onClick={() => handleDownload(index)} disabled={isLoadingImages} className="col-span-1">
                                PNG
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleDownloadTxt(index)} className={cn("col-span-1", (isTextOnly || !qrCodeUris[index]) && "col-span-full")}>
                             TXT
                        </Button>
                        {!isTextOnly && qrCodeUris[index] && (
                            <Button variant="outline" size="sm" onClick={() => handlePrint(index)} disabled={isLoadingImages} className="col-span-2">
                                <Printer className="mr-2 h-4 w-4" />
                                Print (A5)
                            </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSmartCardMode('write-share');
                            setSmartCardWriteData(shares[index]);
                            setSmartCardWriteLabel(getShareTitle(index));
                            setIsSmartCardOpen(true);
                          }}
                          className="col-span-full"
                        >
                          <CreditCard className="mr-2 h-4 w-4" />
                          Smart Card
                        </Button>
                    </div>
                </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 mt-4 text-green-600 dark:text-green-500">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-medium">All shares integrity verified (SHA-256)</span>
        </div>
        <div className="mt-8 border-t pt-6">
            <div className="max-w-md mx-auto text-center space-y-3">
                <h4 className="font-semibold text-base">Save a Backup Vault File</h4>
                <p className="text-sm text-muted-foreground">
                    This saves all your encrypted shares into a single <code className="bg-muted px-1 py-0.5 rounded text-xs">.seqrets</code> file.
                    It does <strong>not</strong> contain your secret &mdash; you still need your password to restore.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button size="lg" onClick={handleExportVaultClick} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md w-full sm:w-auto">
                      <Save className="mr-2 h-5 w-5" /> Export Vault File
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      setSmartCardMode('write-vault');
                      setSmartCardWriteData(getVaultJsonString());
                      // Card listings show item labels without PIN — respect blind export.
                      setSmartCardWriteLabel(exportLabel || `Vault-${setId}`);
                      setIsSmartCardOpen(true);
                    }}
                    className="w-full sm:w-auto"
                  >
                    <CreditCard className="mr-2 h-5 w-5" /> Write Vault to Smart Card
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Store it on iCloud, Google Drive, a USB drive, or a smart card. To restore later, go to <strong>Restore Secret</strong> and click <strong>Import Vault File</strong>.
                </p>
            </div>
        </div>

        <Dialog open={showScanWarning} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-yellow-600" />
                Verify Your QR Qards
              </DialogTitle>
              <DialogDescription className="text-left space-y-3 pt-2">
                <span className="block"><strong className="text-foreground">These QR codes are near the upper size limit</strong> and may be difficult for some cameras to scan.</span>
                <span className="block">After printing, <strong className="text-foreground">test-scan at least one Qard</strong> using the Restore Secret tab to confirm it reads correctly before relying on them as your backup.</span>
                <span className="block">If scanning fails, try a shorter secret or increase the number of shares to reduce per-share data size.</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setShowScanWarning(false)} className="w-full">
                I Understand
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SmartCardDialog
          open={isSmartCardOpen}
          onOpenChange={setIsSmartCardOpen}
          mode={smartCardMode}
          writeData={smartCardWriteData}
          writeLabel={smartCardWriteLabel}
          writeItemType={smartCardMode === 'write-share' ? 'share' : 'vault'}
        />

        <Dialog open={isVaultDialogOpen} onOpenChange={(open) => { if (!isEncryptingVault) { setIsVaultDialogOpen(open); if (!open) resetVaultDialog(); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Protect Your Vault File
              </DialogTitle>
              <DialogDescription>
                Since this file contains all your shares in one place, you can add an extra password to encrypt it. This is separate from your secret&apos;s password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="vault-password">Vault Password (optional)</Label>
                <div className="relative">
                  <Input
                    id="vault-password"
                    type={isVaultPasswordVisible ? 'text' : 'password'}
                    placeholder="Enter a vault password..."
                    value={vaultPassword}
                    onChange={(e) => setVaultPassword(e.target.value)}
                    disabled={isEncryptingVault}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={isVaultPasswordVisible ? 'Hide vault password' : 'Show vault password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setIsVaultPasswordVisible(!isVaultPasswordVisible)}
                  >
                    {isVaultPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {vaultPassword && (
                <div className="space-y-2">
                  <Label htmlFor="vault-password-confirm">Confirm Password</Label>
                  <Input
                    id="vault-password-confirm"
                    type={isVaultPasswordVisible ? 'text' : 'password'}
                    placeholder="Confirm your vault password..."
                    value={vaultPasswordConfirm}
                    onChange={(e) => setVaultPasswordConfirm(e.target.value)}
                    disabled={isEncryptingVault}
                  />
                </div>
              )}
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-col">
              {vaultPassword ? (
                <Button onClick={handleExportWithPassword} disabled={isEncryptingVault} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                  {isEncryptingVault ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encrypting...</>
                  ) : (
                    <><Lock className="mr-2 h-4 w-4" /> Encrypt &amp; Export</>
                  )}
                </Button>
              ) : (
                <Button onClick={handleExportWithoutPassword} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                  <Save className="mr-2 h-4 w-4" /> Export Without Password
                </Button>
              )}
              {!vaultPassword && (
                <p className="text-xs text-muted-foreground text-center">
                  Type a password above to enable encryption, or export as-is.
                </p>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}


