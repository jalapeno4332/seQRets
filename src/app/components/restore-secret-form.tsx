'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from './file-upload';
import { KeyRound, Combine, Loader2, CheckCircle2, Eye, EyeOff, XCircle, Copy, RefreshCcw, X, Paperclip, HelpCircle, Lock, ArrowDown, FolderOpen, QrCode, Sprout } from 'lucide-react';
import QRCode from 'qrcode';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { tryGetEntropy } from '@/lib/crypto';
import jsQR from 'jsqr';
import { useToast } from '@/hooks/use-toast';
import { RestoreSecretRequest, EncryptedVaultFile } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CameraScanner } from './camera-scanner';
import { Switch } from '@/components/ui/switch';
import { KeyfileUpload } from './keyfile-upload';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

interface DecodedShare {
    id: string; // Use a unique ID for each share for stable rendering and removal
    data: string;
    fileName: string;
    success: boolean;
}

export function RestoreSecretForm() {
  const [step, setStep] = useState(1);
  const [decodedShares, setDecodedShares] = useState<DecodedShare[]>([]);
  const [password, setPassword] = useState('');
  const [restoredSecret, setRestoredSecret] = useState('');
  const [restoredLabel, setRestoredLabel] = useState<string | undefined>('');
  const [isRestoring, startRestoreTransition] = useTransition();
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const audioRef = useRef(typeof window !== 'undefined' ? new Audio('/sound.mp3') : null);
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [qrMode, setQrMode] = useState<'none' | 'data' | 'seed'>('none');
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [seedQrUris, setSeedQrUris] = useState<string[]>([]);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [useKeyfile, setUseKeyfile] = useState(false);
  const [keyfile, setKeyfile] = useState<string | null>(null);
  const [keyfileName, setKeyfileName] = useState<string | null>(null);
  const [manualShare, setManualShare] = useState('');

  // Encrypted vault import state
  const [isVaultPasswordDialogOpen, setIsVaultPasswordDialogOpen] = useState(false);
  const [vaultImportPassword, setVaultImportPassword] = useState('');
  const [isVaultPasswordVisible, setIsVaultPasswordVisible] = useState(false);
  const [isDecryptingVault, setIsDecryptingVault] = useState(false);
  const [pendingEncryptedVault, setPendingEncryptedVault] = useState<EncryptedVaultFile | null>(null);
  const [pendingVaultFileName, setPendingVaultFileName] = useState<string>('');

  const cryptoWorkerRef = useRef<Worker>();

  useEffect(() => {
    cryptoWorkerRef.current = new Worker(new URL('@/lib/crypto.worker.ts', import.meta.url));

    cryptoWorkerRef.current.onmessage = (event: MessageEvent<{type: string, payload: any}>) => {
        const { type, payload } = event.data;
        if (type === 'restoreSecretSuccess') {
            setRestoredSecret(payload.secret);
            setRestoredLabel(payload.label);
            setKeyfile(null);
            setKeyfileName(null);
            setDecodedShares([]);
            toast({
                title: 'Secret Restored!',
                description: 'Your secret has been successfully decrypted.',
            });
            startRestoreTransition(() => {}); // To ensure isRestoring is set to false
        } else if (type === 'restoreSecretError') {
            const errorMessage = payload.message || 'An unknown error occurred during restoration.';
            setError(errorMessage);
            toast({
                variant: 'destructive',
                title: 'Restoration Failed',
                description: errorMessage,
            });
             startRestoreTransition(() => {});
        } else if (type === 'decryptVaultSuccess') {
            try {
              const vaultData = JSON.parse(payload);
              processDecryptedVault(vaultData, pendingVaultFileName);
            } catch {
              toast({ variant: 'destructive', title: 'Import Failed', description: 'Decrypted data is not a valid vault file.' });
            }
            setIsDecryptingVault(false);
            setIsVaultPasswordDialogOpen(false);
            setPendingEncryptedVault(null);
            setVaultImportPassword('');
            setIsVaultPasswordVisible(false);
        } else if (type === 'decryptVaultError') {
            const errorMessage = payload.message || 'Could not decrypt the vault file.';
            toast({ variant: 'destructive', title: 'Wrong Password', description: errorMessage });
            setIsDecryptingVault(false);
            setVaultImportPassword('');
        }
    };

    return () => {
        cryptoWorkerRef.current?.terminate();
    };
  }, []);

  const secureWipe = (valueSetter: React.Dispatch<React.SetStateAction<string>>, currentValue: string) => {
    if (!currentValue) return;
    try {
        const randomData = new Uint8Array(currentValue.length);
        window.crypto.getRandomValues(randomData);
        const randomString = Array.from(randomData).map(byte => String.fromCharCode(byte)).join('');
        // Overwrite the state with random data first, then clear
        valueSetter(randomString);
    } catch (e) {
        console.error("Crypto API not available for secure wipe.");
    } finally {
        // Finally, clear the state
        setTimeout(() => valueSetter(''), 50);
    }
  };


  const playSuccessSound = () => {
    if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
        } catch (error) {
            console.error("Error playing sound:", error);
        }
    }
  }

  const addShare = (data: string, fileName: string, success: boolean) => {
    // Prevent adding duplicate shares based on data
    if (data && decodedShares.some(s => s.data === data)) {
      toast({
          variant: "default",
          title: "Duplicate Share",
          description: "This QR code has already been added.",
      });
      return;
    }
    const newShare: DecodedShare = { id: `${Date.now()}-${Math.random()}`, data, fileName, success };
    setDecodedShares(prev => [...prev, newShare]);

    if (success) {
      playSuccessSound();
      toast({
        title: "Share Added!",
        description: `Share from ${fileName} has been added to the list.`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "QR Code Not Found",
        description: `Could not find a QR code in ${fileName}.`,
      });
    }
  };

  const handleManualShareAdd = () => {
    const share = manualShare.trim();
    if (share && share.startsWith('seQRets|')) {
        addShare(share, `Manual Entry ${decodedShares.length + 1}`, true);
        setManualShare('');
        setIsManualEntryOpen(false);
    } else {
        toast({
            variant: "destructive",
            title: "Invalid Share Format",
            description: "A valid share must start with 'seQRets|'. Please check the pasted text.",
        });
    }
  };

  const handleRemoveShare = (idToRemove: string) => {
    setDecodedShares(prev => prev.filter(share => share.id !== idToRemove));
  };


  const handleQrScanned = (data: string) => {
    if (data) {
        addShare(data, `Camera Scan ${decodedShares.length + 1}`, true);
        setIsCameraOpen(false); // Close the dialog on successful scan
    }
  }

  // Decode a QR code from an image using the best available decoder.
  // BarcodeDetector (native Chromium API) handles dense codes far better than jsQR.
  const decodeQR = async (image: HTMLImageElement): Promise<string | null> => {
    // Strategy 1: Native BarcodeDetector API (Chromium / Tauri)
    if ('BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(image);
        if (results.length > 0) return results[0].rawValue;
      } catch (_) { /* fall through to jsQR */ }
    }

    // Strategy 2: jsQR with upscaling fallback (for Firefox/Safari/older browsers)
    for (const scale of [1, 2, 3]) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      canvas.width = image.naturalWidth * scale;
      canvas.height = image.naturalHeight * scale;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code?.data) return code.data;
    }

    return null;
  };

  const handleFilesAdded = (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setIsScanning(true);

    const filePromises = files.map(file => new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const image = new Image();
            image.onload = async () => {
                const result = await decodeQR(image);

                if (result) {
                    addShare(result, file.name, true);
                } else {
                    addShare('', file.name, false);
                }
                resolve();
            };
            image.onerror = () => {
                addShare('', file.name, false);
                resolve();
            };
            image.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }));

    Promise.all(filePromises).finally(() => {
        setIsScanning(false);
    });
};

  const processDecryptedVault = (vaultData: any, fileName: string) => {
    // Validate structure
    if (!vaultData.shares || !Array.isArray(vaultData.shares) || vaultData.shares.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Vault File',
        description: 'The file does not contain valid share data.',
      });
      return;
    }

    // Clear existing shares and add from vault
    setDecodedShares([]);
    let addedCount = 0;
    vaultData.shares.forEach((shareData: string, index: number) => {
      if (shareData && typeof shareData === 'string') {
        const newShare: DecodedShare = {
          id: `vault-${Date.now()}-${index}`,
          data: shareData,
          fileName: `${fileName} (Share ${index + 1})`,
          success: true,
        };
        setDecodedShares(prev => [...prev, newShare]);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      playSuccessSound();
      toast({
        title: 'Vault Imported!',
        description: `${addedCount} shares loaded from "${fileName}". ${vaultData.label ? `Label: ${vaultData.label}` : ''} You need ${vaultData.requiredShares} of ${vaultData.totalShares} to restore.`,
      });
      if (vaultData.keyfileUsed) {
        setUseKeyfile(true);
        toast({
          title: 'Keyfile Required',
          description: 'This vault was created with a keyfile. Please upload the keyfile to restore.',
        });
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'No Valid Shares',
        description: 'The vault file did not contain any valid shares.',
      });
    }
  };

  const handleImportVaultFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.seqrets,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);

          // Check if this is an encrypted vault file (version 2)
          if (parsed.version === 2 && parsed.encrypted === true && parsed.salt && parsed.data) {
            setPendingEncryptedVault(parsed as EncryptedVaultFile);
            setPendingVaultFileName(file.name);
            setIsVaultPasswordDialogOpen(true);
            return;
          }

          // Unencrypted vault — process directly
          processDecryptedVault(parsed, file.name);
        } catch (err) {
          toast({
            variant: 'destructive',
            title: 'Import Failed',
            description: 'Could not parse the vault file. Make sure it is a valid .seqrets file.',
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDecryptVaultImport = () => {
    if (!pendingEncryptedVault || !vaultImportPassword) {
      toast({ variant: 'destructive', title: 'Password Required', description: 'Please enter the vault password.' });
      return;
    }
    setIsDecryptingVault(true);
    cryptoWorkerRef.current?.postMessage({
      type: 'decryptVault',
      payload: {
        salt: pendingEncryptedVault.salt,
        data: pendingEncryptedVault.data,
        password: vaultImportPassword,
      },
    });
  };

  const handleRestore = () => {
    if (decodedShares.length === 0 || !password) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please provide at least one share and a password.',
      });
      return;
    }
    if (useKeyfile && !keyfile) {
      toast({
        variant: 'destructive',
        title: 'Missing Keyfile',
        description: 'Please select a keyfile or disable the keyfile option.',
      });
      return;
    }

    setError(null);
    setRestoredSecret('');
    setRestoredLabel('');

    startRestoreTransition(() => {
        const request: RestoreSecretRequest = {
            shares: decodedShares.filter(s => s.success).map(s => s.data),
            password,
            keyfile: useKeyfile ? keyfile ?? undefined : undefined,
        };
        cryptoWorkerRef.current?.postMessage({ type: 'restoreSecret', payload: request });
    });
  };

  const handleReset = () => {
    secureWipe(setRestoredSecret, restoredSecret);
    secureWipe(setPassword, password);
    setDecodedShares([]);
    setRestoredLabel('');
    setError(null);
    setIsSecretVisible(false);
    setIsPasswordVisible(false);
    setUseKeyfile(false);
    setKeyfile(null);
    setKeyfileName(null);
    setQrMode('none');
    setQrDataUri(null);
    setSeedQrUris([]);
    setStep(1);
  }

  // ── QR display helpers ───────────────────────────────────────────

  /** Encode a single BIP-39 phrase as a SeedQR numeric string (4-digit zero-padded word indices). */
  const toSeedQR = (phrase: string): string =>
    phrase.split(/\s+/).map(word => wordlist.indexOf(word).toString().padStart(4, '0')).join('');

  const mnemonicResult = restoredSecret ? tryGetEntropy(restoredSecret) : null;
  const isMnemonic = mnemonicResult !== null;

  const handleDataQr = async () => {
    if (qrMode === 'data') { setQrMode('none'); setIsQrVisible(false); return; }
    try {
      const uri = await QRCode.toDataURL(restoredSecret, { errorCorrectionLevel: 'L', margin: 2, width: 800 });
      setQrDataUri(uri);
      setQrMode('data');
    } catch { /* QR generation failed — secret may be too long */ }
  };

  const handleSeedQr = async () => {
    if (qrMode === 'seed') { setQrMode('none'); setIsQrVisible(false); return; }
    if (!mnemonicResult) return;
    try {
      const uris = await Promise.all(
        mnemonicResult.chunks.map(chunk =>
          QRCode.toDataURL(toSeedQR(chunk), { errorCorrectionLevel: 'L', margin: 2, width: 800 })
        )
      );
      setSeedQrUris(uris);
      setQrMode('seed');
    } catch { /* QR generation failed */ }
  };

  const handleCopy = () => {
    if (restoredSecret) {
      navigator.clipboard.writeText(restoredSecret);
      toast({
        title: 'Copied to clipboard!',
        description: 'The restored secret has been copied.',
      });
    }
  };

  const uniqueSharesCount = new Set(decodedShares.filter(s => s.success).map(s => s.data)).size;

  const isRestoreButtonDisabled =
    isScanning ||
    isRestoring ||
    decodedShares.filter(s => s.success).length === 0 ||
    !password ||
    (useKeyfile && !keyfile);


  return (
    <Card className="shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)] dark:border-2">
      <CardHeader className="p-10">
        <CardTitle>Restore From Backup</CardTitle>
        <CardDescription>Follow the steps to restore a secret from your backups.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 p-10 pt-0">
        {restoredSecret ? (
            <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
                <h3 className="text-2xl font-bold">Secret Revealed!</h3>
                {restoredLabel && <p className="text-lg text-muted-foreground">Label: <span className="font-semibold">{restoredLabel}</span></p>}
                <div className="relative">
                    <Textarea
                        readOnly
                        value={restoredSecret}
                        rows={5}
                        className={cn(
                            "text-lg font-mono bg-green-50 dark:bg-green-900/20 border-green-200 text-green-900 dark:text-green-100 transition-all duration-300 pr-20",
                            !isSecretVisible && "blur-md"
                        )}
                        />
                    <div className="absolute top-2 right-2 flex flex-col gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => setIsSecretVisible(!isSecretVisible)}
                            title={isSecretVisible ? 'Hide secret' : 'Show secret'}
                        >
                            {isSecretVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={handleCopy}
                            title="Copy secret"
                        >
                            <Copy className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
                <div className="flex justify-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(qrMode === 'data' && "border-primary text-primary")}
                        onClick={handleDataQr}
                    >
                        <QrCode className="mr-2 h-4 w-4" />
                        QR Code
                    </Button>
                    {isMnemonic && (
                      <Button
                          variant="outline"
                          size="sm"
                          className={cn(qrMode === 'seed' && "border-primary text-primary")}
                          onClick={handleSeedQr}
                      >
                          <Sprout className="mr-2 h-4 w-4" />
                          SeedQR
                      </Button>
                    )}
                </div>
                {qrMode !== 'none' && (qrDataUri || seedQrUris.length > 0) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground mx-auto"
                    onClick={() => setIsQrVisible(!isQrVisible)}
                    title={isQrVisible ? 'Hide QR code' : 'Show QR code'}
                  >
                    {isQrVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                )}
                {qrMode === 'data' && qrDataUri && (
                  <div className={cn("transition-all duration-300", !isQrVisible && "blur-md")}>
                    <img src={qrDataUri} alt="QR Code" className="mx-auto max-w-[250px] rounded" />
                    <p className="text-xs text-muted-foreground mt-1">Data QR</p>
                  </div>
                )}
                {qrMode === 'seed' && seedQrUris.length > 0 && (
                  <div className={cn("space-y-3 transition-all duration-300", !isQrVisible && "blur-md")}>
                    {seedQrUris.map((uri, i) => (
                      <div key={i}>
                        <img src={uri} alt={`SeedQR ${i + 1}`} className="mx-auto max-w-[250px] rounded" />
                        <p className="text-xs text-muted-foreground mt-1">
                          SeedQR{seedQrUris.length > 1 ? ` ${i + 1} of ${seedQrUris.length}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={handleReset} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                  <RefreshCcw className="mr-2 h-4 w-4" /> Start Over
                </Button>
            </div>
        ) : (
          <>
            {/* Step 1 */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">1</div>
                <h3 className="text-xl font-semibold">Add Your Qards</h3>
              </div>
              <div className="sm:pl-11 space-y-4">
                <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
                  <FileUpload
                        onFilesAdded={handleFilesAdded}
                        onCameraOpen={() => setIsCameraOpen(true)}
                        onManualOpen={() => setIsManualEntryOpen(true)}
                    />
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Scan QR Code</DialogTitle>
                            <DialogDescription>
                                Position the QR code within the frame. The scan will happen automatically.
                            </DialogDescription>
                        </DialogHeader>
                        {isCameraOpen && <CameraScanner onScan={handleQrScanned} />}
                    </DialogContent>
                </Dialog>

                <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Manual Share Entry</DialogTitle>
                            <DialogDescription>
                                Paste the raw text of your share below. It should start with "seQRets|".
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Textarea
                                placeholder="seQRets|MHoDJz8J69YRmeX993O4PQ==|CAFQ..."
                                value={manualShare}
                                onChange={(e) => setManualShare(e.target.value)}
                                rows={5}
                            />
                        </div>
                        <DialogFooter>
                          <Button type="button" onClick={handleManualShareAdd}>Add Share</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-muted-foreground/20"></div>
                  <span className="mx-3 text-xs text-muted-foreground uppercase">or restore from a vault file</span>
                  <div className="flex-grow border-t border-muted-foreground/20"></div>
                </div>

                <div className="rounded-lg border border-dashed border-accent bg-accent/10 dark:bg-accent/5 p-4 space-y-2">
                  <Button variant="outline" onClick={handleImportVaultFile} className="w-full border-accent hover:bg-accent/20 dark:hover:bg-accent/10">
                    <FolderOpen className="mr-2 h-4 w-4 text-foreground" />
                    Import Vault File (.seqrets)
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Load all shares at once from a previously exported <code className="bg-muted px-1 py-0.5 rounded">.seqrets</code> file.
                  </p>
                </div>

                {decodedShares.length > 0 && (
                    <div className="space-y-2">
                        <Label>Added Shares ({uniqueSharesCount})</Label>
                        <div className="rounded-md border p-2 max-h-48 overflow-y-auto">
                            <ul className="space-y-1">
                            {decodedShares.map((share) => (
                                <li key={share.id} className={cn("text-sm flex items-center justify-between p-1 rounded-md hover:bg-muted/50", !share.success && 'text-destructive')}>
                                    <div className="flex items-center flex-1 min-w-0">
                                        {share.success ? <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 mr-2 text-destructive flex-shrink-0" />}
                                        <span className="truncate" title={share.fileName}>{share.fileName}</span>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <span className="text-xs text-muted-foreground mr-2">{share.success ? 'Success' : 'Failed'}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveShare(share.id)}>
                                          <X className="h-4 w-4" />
                                          <span className="sr-only">Remove share</span>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                            </ul>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="flex justify-end pt-2">
                        <Button onClick={() => setStep(2)} disabled={decodedShares.filter(s => s.success).length === 0} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                            Next Step <ArrowDown className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                )}
              </div>
            </div>

            {/* Common Section for Credentials and Action */}
            {step >= 2 && (
              <div className="animate-in fade-in duration-500 space-y-8">
                <Separator />
                {/* Step 2 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">2</div>
                    <h3 className="text-xl font-semibold">Provide Your Credentials</h3>
                  </div>
                  <div className="sm:pl-11 space-y-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="password-restore">Your Password</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="text-sm">
                                    Enter the exact same password you used when the secret was originally encrypted. Passwords are case-sensitive.
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input id="password-restore" type={isPasswordVisible ? 'text' : 'password'} placeholder="Enter the password used for encryption" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" />
                            <button
                                type="button"
                                onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                            >
                                {isPasswordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-md border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Paperclip className="h-5 w-5" />
                          <Label htmlFor="use-keyfile-restore" className="text-base font-medium">Was a Keyfile used?</Label>
                          <Popover>
                                <PopoverTrigger asChild>
                                    <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="text-sm">
                                    If you attached a keyfile for extra security when creating the Qards, you must enable this and upload the exact same file now to restore your secret.
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Switch id="use-keyfile-restore" checked={useKeyfile} onCheckedChange={setUseKeyfile} />
                      </div>
                      {useKeyfile && (
                        <div className="pt-2">
                          <p className="text-sm text-muted-foreground mb-2">Select the exact same keyfile that was used to create these shares. It will be a `.bin` file if generated by this app.</p>
                          <KeyfileUpload onFileRead={setKeyfile} onFileNameChange={setKeyfileName} fileName={keyfileName} />
                        </div>
                      )}
                    </div>
                     <div className="flex justify-end pt-2">
                        <Button onClick={() => setStep(3)} disabled={!password || (useKeyfile && !keyfile)} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                            Next Step <ArrowDown className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {step >= 3 && (
                <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    {/* Step 3 */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">3</div>
                            <h3 className="text-xl font-semibold">Restore Your Secret</h3>
                        </div>
                        <div className="sm:pl-11 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Once you have added enough shares and entered your credentials, click the button below to decrypt and reveal your secret.
                            </p>
                            {error && (
                                <Alert variant="destructive">
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="flex justify-end">
                                <Button size="lg" onClick={handleRestore} disabled={isRestoreButtonDisabled} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                                    {isScanning || isRestoring ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Combine className="mr-2 h-5 w-5" />}
                                    {isScanning ? 'Scanning...' : isRestoring ? 'Restoring...' : `Restore Secret (${uniqueSharesCount} shares)`}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={isVaultPasswordDialogOpen} onOpenChange={(open) => { if (!isDecryptingVault) { setIsVaultPasswordDialogOpen(open); if (!open) { setPendingEncryptedVault(null); setVaultImportPassword(''); setIsVaultPasswordVisible(false); } } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Encrypted Vault File
            </DialogTitle>
            <DialogDescription>
              This vault file is password-protected. Enter the vault password to unlock it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vault-import-password">Vault Password</Label>
              <div className="relative">
                <Input
                  id="vault-import-password"
                  type={isVaultPasswordVisible ? 'text' : 'password'}
                  placeholder="Enter the vault password..."
                  value={vaultImportPassword}
                  onChange={(e) => setVaultImportPassword(e.target.value)}
                  disabled={isDecryptingVault}
                  onKeyDown={(e) => { if (e.key === 'Enter' && vaultImportPassword) handleDecryptVaultImport(); }}
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
              <p className="text-xs text-muted-foreground">
                This is the password set when the vault file was exported, <strong>not</strong> your secret&apos;s password.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleDecryptVaultImport} disabled={isDecryptingVault || !vaultImportPassword} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
              {isDecryptingVault ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Decrypting...</>
              ) : (
                <><Lock className="mr-2 h-4 w-4" /> Unlock &amp; Import</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
