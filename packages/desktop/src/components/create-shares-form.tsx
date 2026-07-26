import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { PasswordGenerator } from '@/components/ui/password-generator';
import { QrCodeDisplay } from './qr-code-display';
import { Spline, Loader2, RefreshCcw, Eye, EyeOff, Paperclip, Wand, CheckCircle, AlertCircle, FileText, HelpCircle, TriangleAlert, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { CreateSharesResult } from '@/lib/types';
import { createShares } from '@/lib/desktop-crypto';
import { SeedPhraseGenerator } from '@/components/ui/seed-phrase-generator';
import { scrollToReveal } from '@/components/ui/scroll-utils';
import { gzip, detectSlip39, PAYLOAD_PAD_BUCKET } from '@seqrets/crypto';
import { tryGetEntropy } from '@/lib/crypto';
import { HelpHint } from '@/components/ui/help-hint';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { KeyfileGenerator } from './keyfile-generator';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyfileUpload } from './keyfile-upload';
import { SmartCardDialog } from '@/components/smartcard-dialog';
import type { CardItem } from '@/lib/smartcard';


const QR_CAPACITY_WARNING = 900;
const QR_CAPACITY_LIMIT = 1400;


export function CreateSharesForm() {
  const [secret, setSecret] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [totalShares, setTotalShares] = useState(3);
  const [requiredShares, setRequiredShares] = useState(2);
  const [embedRecoveryInfo, setEmbedRecoveryInfo] = useState(true);
  // Label visibility on exports (card face, print, file names). Default ON —
  // preserves familiar behavior; the switch next to the label input explains
  // the trade-off. OFF = "blind export".
  const [showLabelOnExports, setShowLabelOnExports] = useState(true);
  const [generatedQrData, setGeneratedQrData] = useState<CreateSharesResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const [isSecretVisible, setIsSecretVisible] = useState(true);
  const [useKeyfile, setUseKeyfile] = useState(false);
  const [keyfile, setKeyfile] = useState<string | null>(null);
  const [keyfileName, setKeyfileName] = useState<string | null>(null);
  const [isKeyfileSmartCardOpen, setIsKeyfileSmartCardOpen] = useState(false);
  const [showKeyfileWriteSmartCard, setShowKeyfileWriteSmartCard] = useState(false);
  const [keyfileWriteLabel, setKeyfileWriteLabel] = useState('Keyfile');
  const [showSeedGenerator, setShowSeedGenerator] = useState(false);
  // 'valid' = BIP-39 (compressed to entropy) · 'valid-slip39' = SLIP-39 share(s),
  // stored as plain text · 'invalid-slip39' = SLIP-39-shaped but checksum failed
  // (almost certainly a typo) · 'invalid' = seed-like but neither format validates.
  const [seedValidationStatus, setSeedValidationStatus] = useState<'valid' | 'valid-slip39' | 'invalid' | 'invalid-slip39' | 'unchecked'>('unchecked');
  const [estimatedShareSize, setEstimatedShareSize] = useState(0);

  // New state for progressive reveal
  const [step, setStep] = useState(1);
  const endRef = useRef<HTMLDivElement>(null);
  // When the user advances a step, scroll to the bottom so the newly
  // revealed step/section comes fully into view (respects reduced-motion).
  useEffect(() => {
    if (step <= 1) return;
    const el = endRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
    );
    return () => cancelAnimationFrame(id);
  }, [step]);

  const isTextOnly = estimatedShareSize > QR_CAPACITY_LIMIT;

  // Best-effort wipe: overwrites React state with random data, then clears it.
  // IMPORTANT: This does NOT guarantee memory erasure. JS strings are immutable —
  // the overwrite creates a *new* string while the original persists in the V8 heap
  // until garbage-collected. React may also batch the setState calls, so the random
  // intermediate value may never be committed to the fiber tree. This is an inherent
  // limitation of in-browser secret handling; the desktop app's Rust backend uses the
  // zeroize crate for proper memory-safe secret clearing.
  const secureWipe = (valueSetter: React.Dispatch<React.SetStateAction<string>>, currentValue: string) => {
    if (!currentValue) return;
    try {
        const randomData = new Uint8Array(currentValue.length);
        window.crypto.getRandomValues(randomData);
        const randomString = Array.from(randomData).map(byte => String.fromCharCode(byte)).join('');
        valueSetter(randomString);
    } catch (e) {
        console.error("Crypto API not available for secure wipe.");
    } finally {
        setTimeout(() => valueSetter(''), 50);
    }
  };

  const handleKeyfileSmartCardRead = (cardItem: CardItem) => {
    if (cardItem.item_type !== 'keyfile') {
      toast({
        variant: 'destructive',
        title: 'Wrong Item Type',
        description: `Expected a keyfile but got "${cardItem.item_type}". Please select a keyfile item.`,
      });
      return;
    }
    setKeyfile(cardItem.data);
    setKeyfileName(`Smart Card${cardItem.label ? ` (${cardItem.label})` : ''}`);
    setIsKeyfileSmartCardOpen(false);
    toast({ title: 'Keyfile Loaded', description: 'Keyfile loaded from smart card.' });
  };

  // No Worker setup needed — crypto runs natively in Rust via Tauri IPC.


  useEffect(() => {
    const cleanSecret = secret.trim();

    if (cleanSecret) {
        const words = cleanSecret.split(/\s+/).filter(Boolean);
        const isPotentiallyMnemonic = words.length >= 12 && words.every(w => /^[a-z]+$/.test(w));

        if (isPotentiallyMnemonic) {
            if (tryGetEntropy(cleanSecret)) {
                setSeedValidationStatus('valid');
            } else {
                // Not BIP-39 — check for SLIP-39 (Trezor Suite's default backup:
                // 20-word shares; advanced setups use 20/33-word K-of-N sets).
                const slip = detectSlip39(cleanSecret);
                if (slip.status === 'valid') setSeedValidationStatus('valid-slip39');
                else if (slip.status === 'checksum-fail') setSeedValidationStatus('invalid-slip39');
                else setSeedValidationStatus('invalid');
            }
        } else {
            setSeedValidationStatus('unchecked');
        }

        // Mirror the real pipeline: same payload shape (label included), same
        // gzip options, then the same length-privacy padding as padPayload.
        const gzipOpts = { level: 9, windowBits: 15, memLevel: 9 } as const;
        const potentialEntropy = tryGetEntropy(cleanSecret);
        let compressedSize;
        if (potentialEntropy) {
            const payload = JSON.stringify({ secret: potentialEntropy.entropy.toString('base64'), label: label || '', isMnemonic: true, mnemonicLengths: potentialEntropy.chunks.map(c => c.split(' ').length) });
            compressedSize = gzip(payload, gzipOpts).length;
        } else {
            const payload = JSON.stringify({ secret: cleanSecret, label: label || '', isMnemonic: false });
            compressedSize = gzip(payload, gzipOpts).length;
        }
        const paddedSize = Math.max(PAYLOAD_PAD_BUCKET, Math.ceil(compressedSize / PAYLOAD_PAD_BUCKET) * PAYLOAD_PAD_BUCKET);

        // ×1.33 = base64 expansion; +154 covers the envelope segments
        // (seQRets| + salt + v=1 + t/n/i + sha256:) and the nonce/tag bytes.
        const finalSize = (paddedSize * 1.33) + 154;
        setEstimatedShareSize(Math.ceil(finalSize));

    } else {
        setEstimatedShareSize(0);
        setSeedValidationStatus('unchecked');
    }
}, [secret, label]);


  const handleGenerate = async () => {
    if (!secret || !password) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please provide a secret and a password.',
      });
      return;
    }
    if (seedValidationStatus === 'invalid' || seedValidationStatus === 'invalid-slip39') {
        toast({
            variant: 'destructive',
            title: 'Invalid Seed Phrase',
            description: seedValidationStatus === 'invalid-slip39'
                ? 'This looks like a SLIP-39 backup, but one of the words appears to be mistyped. Please check each word.'
                : 'The entered text appears to contain an invalid mnemonic phrase. Please verify your data.',
        });
        return;
    }
    if (!isPasswordValid) {
        toast({
            variant: 'destructive',
            title: 'Invalid Password',
            description: 'Please use a password that meets the security requirements.',
        });
        return;
    }
    if (useKeyfile && !keyfile) {
      toast({
        variant: 'destructive',
        title: 'Missing Keyfile',
        description: 'Please generate or upload a keyfile, or disable the keyfile option.',
      });
      return;
    }

    // Capture current values before the async operation.
    const secretSnapshot = secret;
    const passwordSnapshot = password;
    setIsGenerating(true);

    try {
        const result = await createShares({
            secret,
            password,
            totalShares,
            requiredShares,
            label,
            keyfile: useKeyfile ? (keyfile ?? undefined) : undefined,
            embedRecoveryInfo,
        });

        // Compute isTextOnly from actual share data for ground truth.
        const actuallyTextOnly = result.shares.some((s: string) => s.length > QR_CAPACITY_LIMIT);
        setGeneratedQrData({ ...result, isTextOnly: actuallyTextOnly });
        secureWipe(setSecret, secretSnapshot);
        secureWipe(setPassword, passwordSnapshot);
        setKeyfile(null);
        setKeyfileName(null);
        toast({
            title: 'Shares Generated Successfully',
            description: `Your secret has been encrypted and split into ${result.totalShares} Qards.`,
        });
    } catch (e: any) {
        const errorMessage = e?.message || 'An unknown error occurred during share generation.';
        toast({
            variant: 'destructive',
            title: 'Encryption Failed',
            description: errorMessage,
        });
        setGeneratedQrData(null);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setSecret('');
    setPassword('');
    setLabel('');
    setTotalShares(3);
    setRequiredShares(2);
    setGeneratedQrData(null);
    setIsPasswordValid(false);
    setIsSecretVisible(true);
    setUseKeyfile(false);
    setKeyfile(null);
    setKeyfileName(null);
    setShowSeedGenerator(false);
    setSeedValidationStatus('unchecked');
    setEstimatedShareSize(0);
    setEmbedRecoveryInfo(true);
    setStep(1);
  }

  useEffect(() => {
    if (totalShares < requiredShares) {
        setRequiredShares(totalShares);
    } else if (totalShares >= 2 && requiredShares < 2) {
        setRequiredShares(2);
    }
  }, [totalShares, requiredShares]);

  useEffect(() => {
    if (!useKeyfile) {
      setKeyfile(null);
      setKeyfileName(null);
    }
  }, [useKeyfile]);


  const isSeedValid = seedValidationStatus === 'valid' || seedValidationStatus === 'valid-slip39';
  const isSeedInvalid = seedValidationStatus === 'invalid' || seedValidationStatus === 'invalid-slip39';

  const getSecretBorderColor = () => {
    if (!secret) return 'border-input focus-within:ring-ring';
    if (isSeedValid) return 'border-green-500 focus-within:ring-green-500';
    if (isSeedInvalid) return 'border-red-500 focus-within:ring-red-500';
    return 'border-input focus-within:ring-ring';
  };

  const toggleSecretVisibility = () => {
    setIsSecretVisible(!isSecretVisible);
  };

  const isGenerateButtonDisabled =
    isGenerating ||
    !secret ||
    !password ||
    isSeedInvalid ||
    !isPasswordValid ||
    (useKeyfile && !keyfile);


  const getCapacityColor = () => {
    if (estimatedShareSize > QR_CAPACITY_LIMIT) return 'bg-red-500';
    if (estimatedShareSize > QR_CAPACITY_WARNING) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  return (
    <>
    <Card className="relative shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)] dark:border-0">
      {isGenerating && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 rounded-lg backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
          <p className="mt-3 text-sm text-[hsl(37,10%,75%)]">Encrypting your secret…</p>
        </div>
      )}
      {generatedQrData === null ? (
        <>
          <CardHeader className="p-10">
            <CardTitle>Secure Your Secret</CardTitle>
            <CardDescription>Follow the three steps below to encrypt and split your secret into secure Qard backups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 p-10 pt-0">
            {/* Step 1 */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn("flex items-center justify-center h-8 w-8 rounded-full font-bold text-lg", step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>1</div>
                <h3 className="text-xl font-semibold">Enter Your Secret</h3>
              </div>
              <div className="pl-11 space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="secret">Your Secret Text</Label>
                      <HelpHint>
                          Enter the secret you want to protect. This could be a 12/24-word BIP-39 seed phrase, a 20-word Trezor-style (SLIP-39) backup, a private key, or any other important text. The app will automatically detect valid seed phrases and check them for typos.
                      </HelpHint>
                  </div>
                  <Button onClick={() => setShowSeedGenerator(!showSeedGenerator)} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                      <Wand className="mr-2 h-4 w-4" />
                      {showSeedGenerator ? 'Hide Generator' : 'Generate Seed Phrase'}
                  </Button>
                </div>
                {showSeedGenerator && (
                  <div className="p-4 border rounded-lg bg-muted/50 my-2">
                      <SeedPhraseGenerator onPhraseGenerated={(phrase) => {
                          setSecret(phrase);
                          setIsSecretVisible(false);
                          setShowSeedGenerator(false);
                          scrollToReveal(endRef.current);
                      }} />
                  </div>
                )}
                <div className={cn(
                  "relative overflow-hidden rounded-md border bg-background ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2",
                  getSecretBorderColor()
                )}>
                  <Textarea
                    id="secret"
                    placeholder="Enter your 12 or 24-word seed phrase, private key, or other secret..."
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    rows={4}
                    className={cn(
                      // Border/ring live on the wrapper; the textarea stays transparent and
                      // border-less so the blur mask can't fuzz the outline or bleed its halo past it.
                      "border-0 bg-transparent pr-10 focus-visible:ring-0 focus-visible:ring-offset-0",
                      !isSecretVisible && "blur-sm"
                    )}
                  />
                  <button
                    type="button"
                    onClick={toggleSecretVisibility}
                    className="absolute top-2 right-2 h-7 w-7 text-muted-foreground"
                    aria-label={isSecretVisible ? 'Hide secret' : 'Show secret'}
                  >
                    {isSecretVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {seedValidationStatus !== 'unchecked' && (
                  <div className="text-xs text-muted-foreground mt-2 flex items-center">
                        {isSeedValid ?
                          <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> :
                          <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                        }
                      {seedValidationStatus === 'valid' && 'Valid BIP-39 mnemonic phrase(s) detected. (Optimized)'}
                      {seedValidationStatus === 'valid-slip39' && 'Valid SLIP-39 recovery share(s) detected (Trezor-style backup).'}
                      {seedValidationStatus === 'invalid-slip39' && 'This looks like a SLIP-39 backup, but a word appears to be mistyped — check each word carefully.'}
                      {seedValidationStatus === 'invalid' && 'This looks like a seed phrase, but it has an invalid word count or checksum.'}
                  </div>
                )}
                {secret && (
                  <div className="space-y-2 mt-3">
                      <Label className="text-xs text-muted-foreground">Estimated QR Data per Share ({Math.ceil(estimatedShareSize)} bytes)</Label>
                      <div className="w-full bg-muted rounded-full h-2">
                          <div
                              className={cn("h-2 rounded-full transition-all", getCapacityColor())}
                              style={{ width: `${Math.min((estimatedShareSize / (QR_CAPACITY_LIMIT + 200)) * 100, 100)}%`}}
                          />
                      </div>
                      {estimatedShareSize > QR_CAPACITY_WARNING && (
                          <p className={cn("text-xs", isTextOnly ? "text-red-500" : "text-yellow-600")}>
                              {isTextOnly
                                  ? "Secret is too large for QR codes. Only text file backups will be generated."
                                  : "Secret is large. QR codes may be complex and difficult to scan."
                              }
                          </p>
                      )}
                  </div>
                )}
                 {step === 1 && (
                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={() => setStep(2)}
                            disabled={!secret.trim() || isSeedInvalid}
                            className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                        >
                            Next Step <ArrowDown className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                )}
              </div>
            </div>

            {step >= 2 && (
              <>
                <Separator />
                {/* Step 2 */}
                <div className="space-y-4 animate-in fade-in duration-500">
                  <div className="flex items-center gap-3">
                    <div className={cn("flex items-center justify-center h-8 w-8 rounded-full font-bold text-lg", step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</div>
                    <h3 className="text-xl font-semibold">Secure Your Secret</h3>
                  </div>
                  <div className="pl-11 space-y-6">
                    <PasswordGenerator value={password} onValueChange={setPassword} onValidationChange={setIsPasswordValid} />

                    <div className="space-y-4 rounded-md border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Paperclip className="h-5 w-5" />
                          <Label htmlFor="use-keyfile" className="text-base font-medium">Use a Keyfile</Label>
                            <HelpHint>
                                <Alert variant="destructive" className="border-red-500/50 text-red-500 dark:border-red-500 [&>svg]:text-red-500">
                                    <TriangleAlert className="h-4 w-4" />
                                    <AlertTitle className="font-bold">CRITICAL: Back Up Your Keyfile!</AlertTitle>
                                    <AlertDescription>
                                        You MUST save the keyfile. It is required for recovery and **cannot be generated again.** Store it safely, separate from your Qards. For better obscurity, you can rename the file.
                                    </AlertDescription>
                                </Alert>
                            </HelpHint>
                        </div>
                        <Switch id="use-keyfile" checked={useKeyfile} onCheckedChange={(on) => { setUseKeyfile(on); if (on) scrollToReveal(endRef.current); }} />
                      </div>
                      {useKeyfile && (
                        <div className="pt-2">
                          <Tabs defaultValue="generate" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="generate">Generate Keyfile</TabsTrigger>
                              <TabsTrigger value="upload">Upload Keyfile</TabsTrigger>
                            </TabsList>
                            <TabsContent value="generate" className="pt-4">
                              <KeyfileGenerator onKeyfileGenerated={setKeyfile} onSmartCardSave={(label) => { setKeyfileWriteLabel(label); setShowKeyfileWriteSmartCard(true); }} />
                            </TabsContent>
                            <TabsContent value="upload" className="pt-4">
                              <p className="text-sm text-muted-foreground mb-2">Select a file from your device to use as a keyfile. Any file will work, but larger, more random files are more secure.</p>
                              <KeyfileUpload onFileRead={setKeyfile} onFileNameChange={setKeyfileName} fileName={keyfileName} onSmartCardLoad={() => setIsKeyfileSmartCardOpen(true)} />
                            </TabsContent>
                          </Tabs>
                        </div>
                      )}
                    </div>
                     {step === 2 && (
                        <div className="flex justify-end pt-2">
                             <Button
                                onClick={() => setStep(3)}
                                disabled={!isPasswordValid || (useKeyfile && !keyfile)}
                                className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                            >
                                Next Step <ArrowDown className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {step >= 3 && (
                 <>
                    <Separator />
                    {/* Step 3 */}
                    <div className="space-y-4 animate-in fade-in duration-500">
                      <div className="flex items-center gap-3">
                        <div className={cn("flex items-center justify-center h-8 w-8 rounded-full font-bold text-lg", step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>3</div>
                        <h3 className="text-xl font-semibold">Split into Qards</h3>
                      </div>
                      <div className="pl-11 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex flex-col justify-end space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="label">Optional Label</Label>
                                    <HelpHint>
                                        <p>Add a label to your secret (e.g., &quot;Inheritance Wallet&quot;). An encrypted copy is stored with your secret and appears when you restore it.</p>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Heads up: unless you turn off &quot;Show label on Qards &amp; file names&quot; below, the label is also printed on each Qard and used in file names — where anyone who sees the card or file can read it. Avoid amounts, exchange names, or anything you wouldn&apos;t write on the outside of an envelope.
                                        </p>
                                    </HelpHint>
                                </div>
                                <Input id="label" placeholder="e.g., 'Inheritance Wallet'" value={label} onChange={(e) => setLabel(e.target.value)} />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="total-shares">Total Qards ({totalShares})</Label>
                                    <HelpHint
                                        label={totalShares === 1 ? 'Warning: single Qard' : 'Help'}
                                        icon={totalShares === 1
                                            ? <TriangleAlert className="h-4 w-4 fill-red-500 text-white" />
                                            : <HelpCircle className="h-4 w-4 text-primary" />}
                                    >
                                        {totalShares === 1 ? (
                                            <>
                                                <p className="font-bold mb-2 text-red-500">Single point of failure</p>
                                                <p>One Qard, no backup. If it's damaged, lost, or fades, the secret is unrecoverable.</p>
                                                <p className="mt-2">Two ways to add safety: print or save multiple copies of this same Qard and store them in different places, or use a 2-of-3 split so no single Qard can unlock the secret on its own.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-bold mb-2">Total Qards</p>
                                                This is the total number of QR code backups (Qards) that will be created. You can distribute these among family members, lawyers, or secure physical locations.
                                            </>
                                        )}
                                    </HelpHint>
                                </div>
                                <div className="flex h-10 items-center">
                                  <Slider id="total-shares" min={1} max={10} step={1} value={[totalShares]} onValueChange={([val]) => setTotalShares(val)} />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="required-shares">Qards to Restore ({requiredShares})</Label>
                                    <HelpHint>
                                        <p className="font-bold mb-2">Qards to Restore</p>
                                        This is the minimum number of Qards that must be brought together to recover the original secret. This is also known as the "threshold".
                                        <p className="mt-2 text-xs text-muted-foreground">For example, a 3-of-5 setup means you create 5 total Qards, but only need any 3 of them to restore your secret.</p>
                                    </HelpHint>
                                </div>
                                <div className="flex h-10 items-center">
                                  <Slider id="required-shares" min={totalShares === 1 ? 1 : 2} max={totalShares} step={1} value={[requiredShares]} onValueChange={([val]) => setRequiredShares(val)} />
                                </div>
                            </div>
                        </div>
                        {totalShares > 1 && (
                          <div className="flex items-center justify-between rounded-md border p-4 gap-3">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <Label htmlFor="embed-recovery-info" className="text-base font-medium">
                                  Include Qard Share Data ({requiredShares} of {totalShares}) in QR
                                </Label>
                                <HelpHint label="Help: Qard share data">
                                  <p className="font-bold mb-2">Qard Share Data</p>
                                  <p>
                                    Embeds the threshold ({requiredShares}) and total ({totalShares}) inside each Qard&apos;s QR data.
                                    During restoration, the app shows a live countdown — for example, &quot;1 more Qard required&quot;.
                                    Helpful for heirs decades from now.
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Trade-off: anyone who scans a Qard learns that you split your secret into {totalShares} parts and need {requiredShares} to restore it.
                                    Without the password, that information is not enough to recover anything — but it does narrow what an attacker is searching for.
                                  </p>
                                </HelpHint>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {embedRecoveryInfo
                                  ? 'On — heirs will see a countdown during restore'
                                  : 'Off — QR data stays minimal'}
                              </p>
                            </div>
                            <Switch id="embed-recovery-info" checked={embedRecoveryInfo} onCheckedChange={setEmbedRecoveryInfo} />
                          </div>
                        )}
                        {label.trim() !== '' && (
                          <div className="flex items-center justify-between rounded-md border p-4 gap-3">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <Label htmlFor="show-label-on-exports" className="text-base font-medium">
                                  Show label on Qards &amp; file names
                                </Label>
                                <HelpHint>
                                  <p className="font-bold mb-2">Where your label appears</p>
                                  <p>
                                    When on, &quot;{label.trim()}&quot; is printed on each Qard card and used in the PNG, TXT, ZIP, and vault file names — easy to sort, but readable by anyone who sees a card or file.
                                  </p>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Turn this off for a &quot;blind&quot; export: cards show only the card number and set ID, and files are named seQRets-Qard-01, seQRets-Qard-02, and so on. The encrypted copy of the label is unaffected — it still appears when the secret is restored.
                                  </p>
                                </HelpHint>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {showLabelOnExports
                                  ? 'On — the label is readable on every card and file name'
                                  : 'Off — cards and file names stay blind; the label only appears after restore'}
                              </p>
                            </div>
                            <Switch id="show-label-on-exports" checked={showLabelOnExports} onCheckedChange={setShowLabelOnExports} />
                          </div>
                        )}
                      </div>
                    </div>
                </>
            )}
          </CardContent>
          {step >= 3 && (
              <CardFooter className="flex flex-col items-stretch gap-6 p-10 pt-0 animate-in fade-in duration-500">
                <Separator />
                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-6">
                  <Button size="lg" onClick={handleGenerate} disabled={isGenerateButtonDisabled} className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : isTextOnly ? (
                      <FileText className="mr-2 h-5 w-5" />
                    ) : (
                      <Spline className="mr-2 h-5 w-5" />
                    )}
                    {isGenerating ? 'Generating...' : isTextOnly ? 'Encrypt & Generate Text-Only Shares' : 'Encrypt & Generate QR Qards'}
                  </Button>
                </div>
              </CardFooter>
          )}
        </>
      ) : (
        <>
            <CardHeader className="flex flex-row justify-between items-center p-10">
                <div className="flex items-center gap-2">
                    <CardTitle className="pb-2">Your Encrypted Qards</CardTitle>
                    <HelpHint>
                        <Alert variant="destructive">
                            <TriangleAlert className="h-4 w-4" />
                            <AlertTitle>CRITICAL: Secure Your Credentials!</AlertTitle>
                            <AlertDescription>
                                You have successfully created your Qard backups. Your final step is to secure the password {keyfile ? 'and the keyfile' : ''} you used for encryption. Without them, these Qards are permanently useless. Do not proceed until you have saved your credentials.
                            </AlertDescription>
                        </Alert>
                    </HelpHint>
                </div>
                <Button onClick={handleReset} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Start Over
                </Button>
            </CardHeader>
             <CardContent className="p-10 pt-0">
                <QrCodeDisplay
                  qrCodeData={generatedQrData}
                  keyfileUsed={!!keyfile}
                  showLabelOnExports={showLabelOnExports}
                />
            </CardContent>
        </>
      )}
    </Card>

    <SmartCardDialog
      open={isKeyfileSmartCardOpen}
      onOpenChange={setIsKeyfileSmartCardOpen}
      mode="read"
      onDataRead={handleKeyfileSmartCardRead}
    />

    <SmartCardDialog
      open={showKeyfileWriteSmartCard}
      onOpenChange={setShowKeyfileWriteSmartCard}
      mode="write-vault"
      writeData={keyfile || undefined}
      writeLabel={keyfileWriteLabel || 'Keyfile'}
      writeItemType="keyfile"
    />
    <div ref={endRef} aria-hidden="true" />
    </>
  );
}


