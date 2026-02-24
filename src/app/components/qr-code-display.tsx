
'use client';

import { Button } from '@/components/ui/button';
import { Printer, FileArchive, TriangleAlert, Loader2, Lock, Save, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, useRef } from 'react';
import JSZip from 'jszip';
import { useToast } from '@/hooks/use-toast';
import { CreateSharesResult, QrCodeData, EncryptedVaultFile } from '@/lib/types';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface QrCodeDisplayProps {
  qrCodeData: CreateSharesResult;
  keyfileUsed: boolean;
}

export function QrCodeDisplay({ qrCodeData, keyfileUsed }: QrCodeDisplayProps) {
  const { shares, totalShares, requiredShares, label, setId, isTextOnly, encryptedInstructions } = qrCodeData;
  const [qrCodeUris, setQrCodeUris] = useState<(string | null)[]>([]);
  const { toast } = useToast();
  const [isLoadingImages, setIsLoadingImages] = useState(!isTextOnly);

  // Vault export password dialog state
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState('');
  const [isVaultPasswordVisible, setIsVaultPasswordVisible] = useState(false);
  const [isEncryptingVault, setIsEncryptingVault] = useState(false);
  const vaultWorkerRef = useRef<Worker>();

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

  const getShareTitle = (index: number) => {
    const sanitizedLabel = label ? `-${label.replace(/[^a-zA-Z0-9_-]/g, '')}` : '';
    return `seQRets-Share-${index + 1}${sanitizedLabel}`;
  }

  const getPrintableStyles = (forPrintAll: boolean = false) => `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap');
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
                    ${label ? `Label: <b style="font-weight: 500;">${escapeHtml(label)}</b><br/>` : ''}
                    Created: <b style="font-weight: 500;">${createdDate}</b>
                </div>

                <div style="display: flex; align-items: center; justify-content: center; color: #DC2626; font-weight: 500; font-size: 14px; margin-bottom: 10px;">
                    <svg viewBox="0 0 20 20" fill="currentColor" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.001-1.742 3.001H4.42c-1.532 0-2.492-1.667-1.742-3.001l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
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

  /**
   * Render the card via html2canvas, then overdraw the QR region with the raw
   * QR data-URL using nearest-neighbour scaling so every module stays crisp.
   */
  const compositeQrOntoCard = async (
    elementToCapture: HTMLElement,
    qrUri: string | null,
    scale: number,
  ): Promise<HTMLCanvasElement> => {
    // 1. Find the QR <img> inside the card so we know where to overdraw
    const qrImg = elementToCapture.querySelector('img[alt="QR Code"]') as HTMLImageElement | null;
    let qrRect: { x: number; y: number; w: number; h: number } | null = null;
    if (qrImg && qrUri) {
      const cardRect = elementToCapture.getBoundingClientRect();
      const imgRect = qrImg.getBoundingClientRect();
      qrRect = {
        x: (imgRect.left - cardRect.left) * scale,
        y: (imgRect.top - cardRect.top) * scale,
        w: imgRect.width * scale,
        h: imgRect.height * scale,
      };
    }

    // 2. Capture the full card (QR will be blurry — we'll fix that next)
    const canvas = await html2canvas(elementToCapture, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    // 3. Overdraw the QR region with the raw data-URL at native resolution
    if (qrRect && qrUri) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = qrUri;
        });
        // Clear the blurry QR area and redraw with nearest-neighbour
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(qrRect.x, qrRect.y, qrRect.w, qrRect.h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrRect.x, qrRect.y, qrRect.w, qrRect.h);
        ctx.drawImage(img, qrRect.x, qrRect.y, qrRect.w, qrRect.h);
      }
    }

    return canvas;
  };

  const handleDownload = async (index: number) => {
    if (!isTextOnly && isLoadingImages) {
        toast({ variant: "destructive", title: "Images not ready", description: "The Qard images have not been generated yet." });
        return;
    }
    if (!isTextOnly && !qrCodeUris[index]) {
      toast({ variant: "destructive", title: "Image not ready", description: "The Qard image failed to generate." });
      return;
    }

    const container = document.createElement('div');
    container.innerHTML = getPrintableHtmlForShare(index);
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    const elementToCapture = document.getElementById(`qard-to-print-${index}`);
    if (!elementToCapture) {
        toast({ variant: "destructive", title: "Element not found", description: "Cannot find the Qard to download." });
        document.body.removeChild(container);
        return;
    }

    try {
        const canvas = await compositeQrOntoCard(elementToCapture, qrCodeUris[index], 4);
        const imageUri = canvas.toDataURL('image/png');
        const link = document.createElement("a");
        link.download = `${getShareTitle(index)}.png`;
        link.href = imageUri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({
            title: "Download Started",
            description: `Downloading ${getShareTitle(index)}.png`,
        });
    } catch (error) {
        console.error("Error generating image for download:", error);
        toast({
            variant: "destructive",
            title: "Download Failed",
            description: "Could not generate the downloadable image.",
        });
    } finally {
        document.body.removeChild(container);
    }
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
    const zip = new JSZip();
    try {
        for(let i = 0; i < shares.length; i++) {
            const title = getShareTitle(i);
            zip.file(`${title}.txt`, shares[i]);

            if (!isTextOnly && qrCodeUris[i]) {
                const container = document.createElement('div');
                container.innerHTML = getPrintableHtmlForShare(i);
                container.style.position = 'absolute';
                container.style.left = '-9999px';
                document.body.appendChild(container);

                const elementToCapture = document.getElementById(`qard-to-print-${i}`);
                if (elementToCapture) {
                    const canvas = await compositeQrOntoCard(elementToCapture, qrCodeUris[i], 4);
                    const pngDataUrl = canvas.toDataURL('image/png');
                    const base64Data = pngDataUrl.substring(pngDataUrl.indexOf(',') + 1);
                    zip.file(`${title}.png`, base64Data, { base64: true });
                }
                document.body.removeChild(container);
            }
        }

        if (encryptedInstructions) {
            const instructionsContent = JSON.stringify(encryptedInstructions, null, 2);
            zip.file('seqrets-instructions.json', instructionsContent);
        }

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

  const getVaultJsonString = () => {
    const vaultData = {
      version: 1,
      label: qrCodeData.label || 'Untitled',
      setId: qrCodeData.setId,
      shares: qrCodeData.shares,
      requiredShares: qrCodeData.requiredShares,
      totalShares: qrCodeData.totalShares,
      createdAt: new Date().toISOString(),
      encryptedInstructions: qrCodeData.encryptedInstructions || null,
      keyfileUsed: keyfileUsed,
    };
    return JSON.stringify(vaultData, null, 2);
  };

  const downloadVaultFile = (content: string, isEncrypted: boolean) => {
    const vaultLabel = qrCodeData.label || 'Untitled';
    const sanitizedLabel = (vaultLabel).replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${sanitizedLabel}-${new Date().toISOString().split('T')[0]}.seqrets`;
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
    if (vaultPassword.length < 4) {
      toast({ variant: 'destructive', title: 'Password Too Short', description: 'Vault password must be at least 4 characters.' });
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

    const generateQrUris = async () => {
        setIsLoadingImages(true);
        const uris = await Promise.all(
            shares.map(share => {
                const errorCorrectionLevel = share.length > 200 ? 'L' : 'M';
                return QRCode.toDataURL(share, {
                    errorCorrectionLevel,
                    margin: 2,
                    width: 800,
                }).catch(err => {
                    console.error("QR generation failed for a share:", err);
                    return null;
                })
            })
        );
        setQrCodeUris(uris);
        setIsLoadingImages(false);
    };

    generateQrUris();
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


