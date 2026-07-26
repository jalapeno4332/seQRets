
'use client';

import { Button } from '@/components/ui/button';
import { Printer, FileArchive, TriangleAlert, Loader2, Lock, Save, Eye, EyeOff, ShieldCheck, ScanLine } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { CreateSharesResult, QrCodeData, EncryptedVaultFile } from '@/lib/types';
import { qardFileTitle, generateQardQrUris, renderQardToCanvas, buildQardsZip, buildVaultJson } from '@/components/ui/qard-render';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface QrCodeDisplayProps {
  qrCodeData: CreateSharesResult;
  keyfileUsed: boolean;
  /**
   * When false ("blind export"), the label is kept OFF every export surface —
   * card face, print HTML and print-window title, PNG/TXT/ZIP file names, and
   * the vault file name — so a card or file reveals nothing but a number and
   * set ID. The encrypted copy inside the payload is unaffected. Defaults to
   * true (label visible), matching historical behavior.
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
  const [cardDataUrls, setCardDataUrls] = useState<(string | null)[]>([]);
  const { toast } = useToast();
  const [isLoadingImages, setIsLoadingImages] = useState(!isTextOnly);

  // Vault export password dialog state
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState('');
  const [isVaultPasswordVisible, setIsVaultPasswordVisible] = useState(false);
  const [isEncryptingVault, setIsEncryptingVault] = useState(false);
  const vaultWorkerRef = useRef<Worker>();

  // Scan warning modal state — shown once per session for near-limit QR codes
  const QR_CAPACITY_WARNING = 900;
  const isNearLimit = !isTextOnly && shares.length > 0 && shares[0].length > QR_CAPACITY_WARNING;
  const [showScanWarning, setShowScanWarning] = useState(isNearLimit);

  useEffect(() => {
    vaultWorkerRef.current = new Worker(new URL('@/lib/crypto.worker.ts', import.meta.url));
    vaultWorkerRef.current.onmessage = (event: MessageEvent<{ type: string; payload: any }>) => {
      const { type, payload } = event.data;
      if (type === 'encryptVaultSuccess') {
        const encryptedFile: EncryptedVaultFile = {
          version: 2,
          encrypted: true,
          salt: payload.salt,
          data: payload.data,
        };
        downloadVaultFile(JSON.stringify(encryptedFile, null, 2), true);
        setIsEncryptingVault(false);
        setIsVaultDialogOpen(false);
        resetVaultDialog();
      } else if (type === 'encryptVaultError') {
        toast({ variant: 'destructive', title: 'Encryption Failed', description: payload.message || 'Could not encrypt the vault file.' });
        setIsEncryptingVault(false);
      }
    };
    return () => vaultWorkerRef.current?.terminate();
  }, []);

  const getShareTitle = (index: number) => qardFileTitle(exportLabel, index, setId);

  // The print window is opened as about:blank, so relative URLs don't resolve —
  // fonts must be referenced by absolute same-origin URL. Self-hosted (L2):
  // no Google Fonts request. Inter is a variable font; one file covers all weights.
  const getPrintFontCss = () => `
    @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 100 900;
        src: url('${window.location.origin}/fonts/inter-latin.woff2') format('woff2');
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 100 900;
        src: url('${window.location.origin}/fonts/inter-latin-ext.woff2') format('woff2');
        unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
  `;

  const getPrintableStyles = (forPrintAll: boolean = false) => `
    ${getPrintFontCss()}
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
                <h2 style="font-size: 20px; font-weight: 700; margin: 20px 0 5px 0; color: #231f20;">Qard #${index + 1}</h2>
                <p style="font-size: 14px; color: #6b6567; margin: 0 0 10px 0;">Set: <b style="font-weight: 500;">${escapeHtml(setId)}</b></p>

                <div style="font-size: 14px; color: #3e3739; line-height: 1.6; margin-bottom: 20px;">
                    ${exportLabel ? `Label: <b style="font-weight: 500;">${escapeHtml(exportLabel)}</b><br/>` : ''}
                    Created: <b style="font-weight: 500;">${createdDate}</b>
                </div>

                <div style="display: flex; align-items: center; justify-content: center; color: #DC2626; font-weight: 500; font-size: 14px; margin-bottom: 10px;">
                    <span style="margin-right: 6px; font-size: 16px;">⚠️</span>
                    <span>Store securely and separately from other qards</span>
                </div>

                <p style="font-size: 12px; color: #6b6567; margin: 0;">Scan QR with seQRets App to recover secret.</p>
            </div>

        </div>
      </div>
    `;
  };

  const handlePrint = (index: number) => {
    const printWindow = window.open('', '', 'height=842,width=595');
    if (printWindow) {
        const fullHtml = `
          <html>
            <head>
              <title>${getShareTitle(index)}</title>
              <style>${getPrintableStyles()}</style>
            </head>
            <body>${getPrintableHtmlForShare(index)}</body>
          </html>`;
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    }
  };

  const handlePrintAll = () => {
      const printWindow = window.open('', '', 'height=842,width=595');
      if (printWindow) {
        let allSharesHtml = shares.map((_, index) => getPrintableHtmlForShare(index, true)).join('');
        const fullHtml = `
          <html>
            <head>
              <title>seQRets Qards</title>
              <style>${getPrintableStyles(true)}</style>
            </head>
            <body>${allSharesHtml}</body>
          </html>`;
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
      }
  };

  // Canvas card rendering lives in shared-ui (qard-render.ts). Web uses the
  // classic layout (no fingerprint) with the web footer line.
  const renderCardToCanvas = (index: number, qrDataUrl: string, scale: number = 4): Promise<string> =>
    renderQardToCanvas(qrDataUrl, {
      cardNumber: index + 1,
      setId,
      label: exportLabel,
      dateStr: new Date().toLocaleDateString('en-US'),
      footerText: 'Scan QR with seQRets App to recover secret.',
      scale,
    });

  // Synchronous click handler — uses pre-generated card images so Safari
  // doesn't lose the user-gesture context (which blocks programmatic downloads).
  const handleDownload = (index: number) => {
    const dataUrl = cardDataUrls[index];
    if (!dataUrl) {
      toast({ variant: "destructive", title: "Image not ready", description: "The Qard image is still being generated. Please try again in a moment." });
      return;
    }

    // Convert data URL to blob synchronously
    const byteString = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ia], { type: 'image/png' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${getShareTitle(index)}.png`;
    link.href = href;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    toast({
        title: "Download Started",
        description: `Downloading ${getShareTitle(index)}.png`,
    });
  };

  const handleDownloadTxt = (index: number) => {
    const shareData = shares[index];
    const title = getShareTitle(index);
    const blob = new Blob([shareData], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${title}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    toast({
        title: "Download Started",
        description: `Downloading ${title}.txt`,
    });
  };


  const handleDownloadAll = async () => {
    if (!isTextOnly && qrCodeUris.length !== shares.length) {
        toast({ variant: "destructive", title: "Images not ready", description: "Not all Qard images have been generated yet." });
        return;
    }
    try {
        const zip = await buildQardsZip({
            shares,
            label: exportLabel,
            setId,
            // Prefer the pre-rendered card image; fall back to the bare QR.
            getPngDataUrl: (i) => (!isTextOnly ? (cardDataUrls[i] || qrCodeUris[i]) : null),
            encryptedInstructions,
        });
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "seQRets-shares.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({
            title: "Download Started",
            description: "Creating and downloading seQRets-shares.zip",
        });
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

  const downloadVaultFile = (content: string, isEncrypted: boolean) => {
    // Blind export: vault FILENAME must not leak the label (contents may be
    // encrypted, the file name never is).
    const vaultLabel = (exportLabel || (showLabelOnExports ? 'Untitled' : `seQRets-Vault-${setId}`));
    const sanitizedLabel = (vaultLabel).replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${sanitizedLabel}.seqrets`;
    const blob = new Blob([content], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    toast({
      title: isEncrypted ? 'Encrypted Vault Exported!' : 'Vault Exported!',
      description: `Saved as ${filename}. ${isEncrypted ? 'This file is password-protected.' : 'Store this file safely.'}`,
    });
  };

  const handleExportVaultClick = () => {
    setIsVaultDialogOpen(true);
  };

  const handleExportWithoutPassword = () => {
    downloadVaultFile(getVaultJsonString(), false);
    setIsVaultDialogOpen(false);
    resetVaultDialog();
  };

  const handleExportWithPassword = () => {
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
    vaultWorkerRef.current?.postMessage({
      type: 'encryptVault',
      payload: { jsonString: getVaultJsonString(), password: vaultPassword },
    });
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

  // Pre-generate card images as data URLs after QR codes are ready.
  // Uses pure Canvas 2D API (no html2canvas) for reliable cross-browser support.
  // This allows the PNG download click handler to be fully synchronous,
  // which is required by Safari (async breaks the user-gesture context).
  useEffect(() => {
    if (isTextOnly || isLoadingImages || qrCodeUris.length !== shares.length) {
      setCardDataUrls([]);
      return;
    }
    let cancelled = false;
    const preGenerate = async () => {
      // Ensure fonts are loaded before Canvas text rendering
      await document.fonts.ready;
      const urls: (string | null)[] = [];
      for (let i = 0; i < shares.length; i++) {
        if (cancelled) return;
        if (!qrCodeUris[i]) { urls.push(null); continue; }
        try {
          const dataUrl = await renderCardToCanvas(i, qrCodeUris[i]!);
          urls.push(dataUrl);
        } catch (err) {
          console.error(`Pre-generation failed for share ${i}:`, err);
          urls.push(null);
        }
      }
      if (!cancelled) setCardDataUrls(urls);
    };
    preGenerate();
    return () => { cancelled = true; };
  }, [qrCodeUris, isLoadingImages, isTextOnly, shares.length]);

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
                                <Image
                                    src={qrCodeUris[index]!}
                                    alt={`QR Code for Share ${index + 1}`}
                                    width={150}
                                    height={150}
                                    data-ai-hint="qr code"
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
                            <Button variant="outline" size="sm" onClick={() => handleDownload(index)} disabled={!cardDataUrls[index]} className="col-span-1">
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
                    </div>
                </div>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t pt-6">
            <div className="max-w-md mx-auto text-center space-y-3">
                <h4 className="font-semibold text-base">Save a Backup Vault File</h4>
                <p className="text-sm text-muted-foreground">
                    This saves all your encrypted shares into a single <code className="bg-muted px-1 py-0.5 rounded text-xs">.seqrets</code> file.
                    It does <strong>not</strong> contain your secret &mdash; you still need your password to restore.
                </p>
                <Button size="lg" onClick={handleExportVaultClick} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md w-full sm:w-auto">
                    <Save className="mr-2 h-5 w-5" /> Export Vault File
                </Button>
                <p className="text-xs text-muted-foreground">
                    Store it on iCloud, Google Drive, or a USB drive. To restore later, go to <strong>Restore Secret</strong> and click <strong>Import Vault File</strong>.
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


