import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { PasswordGenerator } from './password-generator';
import { QrCodeDisplay } from './qr-code-display';
import { Spline, Loader2, RefreshCcw, Eye, EyeOff, Paperclip, Wand, CheckCircle, AlertCircle, FileText, HelpCircle, TriangleAlert, Lock, Hash, Share2, UploadCloud, ArrowDown, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { QrCodeData, CreateSharesRequest, CreateSharesResult } from '@/lib/types';
import { SeedPhraseGenerator } from './seed-phrase-generator';
import { gzip } from 'pako';
import { tryGetEntropy } from '@/lib/crypto';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { KeyfileGenerator } from './keyfile-generator';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyfileUpload } from './keyfile-upload';
import { InstructionsFileUpload } from './instructions-file-upload';


const QR_CAPACITY_WARNING = 900;
const QR_CAPACITY_LIMIT = 1400;


export function CreateSharesForm() {
  const [secret, setSecret] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [totalShares, setTotalShares] = useState(3);
  const [requiredShares, setRequiredShares] = useState(2);
  const [generatedQrData, setGeneratedQrData] = useState<CreateSharesResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const [isSecretVisible, setIsSecretVisible] = useState(true);
  const [useKeyfile, setUseKeyfile] = useState(false);
  const [keyfile, setKeyfile] = useState<string | null>(null);
  const [keyfileName, setKeyfileName] = useState<string | null>(null);
  const [showSeedGenerator, setShowSeedGenerator] = useState(false);
  const [seedValidationStatus, setSeedValidationStatus] = useState<'valid' | 'invalid' | 'unchecked'>('unchecked');
  const [estimatedShareSize, setEstimatedShareSize] = useState(0);

  // New state for progressive reveal
  const [step, setStep] = useState(1);
  const cryptoWorkerRef = useRef<Worker>();

  const isTextOnly = estimatedShareSize > QR_CAPACITY_LIMIT;

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

  useEffect(() => {
    cryptoWorkerRef.current = new Worker(new URL('@/lib/crypto.worker.ts', import.meta.url), { type: 'module' });

    cryptoWorkerRef.current.onmessage = (event: MessageEvent<{ type: string, payload: any }>) => {
        const { type, payload } = event.data;
        if (type === 'createSharesSuccess') {
            setGeneratedQrData({ ...payload, isTextOnly });
            secureWipe(setSecret, secret);
            secureWipe(setPassword, password);
            toast({
                title: 'Shares Generated Successfully',
                description: `Your secret has been encrypted and split into ${payload.totalShares} Qards.`,
            });
        } else if (type === 'createSharesError') {
            const errorMessage = payload.message || 'An unknown error occurred during share generation.';
            toast({
                variant: 'destructive',
                title: 'Encryption Failed',
                description: errorMessage,
            });
            setGeneratedQrData(null);
        }
        setIsGenerating(false);
    };

    cryptoWorkerRef.current.onerror = (e) => {
        toast({
            variant: 'destructive',
            title: 'Worker Error',
            description: 'An unexpected error occurred in the cryptography worker.',
        });
        setIsGenerating(false);
    };

    return () => {
        cryptoWorkerRef.current?.terminate();
    };
  }, []); // Empty dependency array ensures this runs only once


  useEffect(() => {
    const cleanSecret = secret.trim();

    if (cleanSecret) {
        const words = cleanSecret.split(/\s+/).filter(Boolean);
        const isPotentiallyMnemonic = words.length >= 12 && words.every(w => /^[a-z]+$/.test(w));

        if (isPotentiallyMnemonic) {
            setSeedValidationStatus(tryGetEntropy(cleanSecret) ? 'valid' : 'invalid');
        } else {
            setSeedValidationStatus('unchecked');
        }

        const potentialEntropy = tryGetEntropy(cleanSecret);
        let compressedSize;
        if (potentialEntropy) {
            const payload = JSON.stringify({ secret: potentialEntropy.entropy.toString('base64'), mnemonicLengths: potentialEntropy.chunks.map(c => c.split(' ').length), isMnemonic: true });
            compressedSize = gzip(payload).length;
        } else {
            const payload = JSON.stringify({ secret: cleanSecret, isMnemonic: false });
            compressedSize = gzip(payload, {
                level: 9,
                windowBits: 15,
                memLevel: 9,
            }).length;
        }

        const finalSize = (compressedSize * 1.33) + 150;
        setEstimatedShareSize(Math.ceil(finalSize));

    } else {
        setEstimatedShareSize(0);
        setSeedValidationStatus('unchecked');
    }
}, [secret]);


  const handleGenerate = () => {
    if (!secret || !password) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please provide a secret and a password.',
      });
      return;
    }
    if (seedValidationStatus === 'invalid') {
        toast({
            variant: 'destructive',
            title: 'Invalid Seed Phrase',
            description: 'The entered text appears to contain an invalid mnemonic phrase. Please verify your data.',
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

    setIsGenerating(true);
    const worker = cryptoWorkerRef.current;
    if (!worker) {
        setIsGenerating(false);
        return;
    };

    worker.postMessage({
        type: 'createShares',
        payload: {
            secret,
            password,
            totalShares,
            requiredShares,
            label,
            keyfile: useKeyfile ? (keyfile ?? undefined) : undefined,
        } satisfies CreateSharesRequest,
    });
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
    setStep(1);
  }

  useEffect(() => {
    if (totalShares < requiredShares) {
        setRequiredShares(totalShares);
    }
  }, [totalShares, requiredShares]);

  useEffect(() => {
    if (!useKeyfile) {
      setKeyfile(null);
      setKeyfileName(null);
    }
  }, [useKeyfile]);


  const getSecretBorderColor = () => {
    if (!secret) return '';
    if (seedValidationStatus === 'valid') return 'border-green-500 focus-visible:ring-green-500';
    if (seedValidationStatus === 'invalid') return 'border-red-500 focus-visible:ring-red-500';
    return '';
  };

  const toggleSecretVisibility = () => {
    setIsSecretVisible(!isSecretVisible);
  };

  const isGenerateButtonDisabled =
    isGenerating ||
    !secret ||
    !password ||
    seedValidationStatus === 'invalid' ||
    !isPasswordValid ||
    (useKeyfile && !keyfile);


  const getCapacityColor = () => {
    if (estimatedShareSize > QR_CAPACITY_LIMIT) return 'bg-red-500';
    if (estimatedShareSize > QR_CAPACITY_WARNING) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  return (
    <Card className="shadow-lg">
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
                      <Popover>
                          <PopoverTrigger asChild>
                              <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                          </PopoverTrigger>
                          <PopoverContent className="text-sm">
                              Enter the secret you want to protect. This could be a 12/24-word BIP-39 seed phrase, a private key, or any other important text. The app will automatically detect valid seed phrases for better storage efficiency.
                          </PopoverContent>
                      </Popover>
                  </div>
                  <Button onClick={() => setShowSeedGenerator(!showSeedGenerator)} className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600">
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
                      }} />
                  </div>
                )}
                <div className="relative">
                  <Textarea
                    id="secret"
                    placeholder="Enter your 12 or 24-word seed phrase, private key, or other secret..."
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    rows={4}
                    className={cn(
                      "pr-10",
                      getSecretBorderColor(),
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
                        {seedValidationStatus === 'valid' ?
                          <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> :
                          <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                        }
                      {seedValidationStatus === 'valid' ? 'Valid BIP-39 mnemonic phrase(s) detected. (Optimized)' : 'This looks like a seed phrase, but it has an invalid word count or checksum.'}
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
                            disabled={!secret.trim() || seedValidationStatus === 'invalid'}
                            className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600"
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
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="text-sm">
                                    <Alert variant="destructive" className="border-red-500/50 text-red-500 dark:border-red-500 [&>svg]:text-red-500">
                                        <TriangleAlert className="h-4 w-4" />
                                        <AlertTitle className="font-bold">CRITICAL: Back Up Your Keyfile!</AlertTitle>
                                        <AlertDescription>
                                            You MUST save the keyfile. It is required for recovery and **cannot be generated again.** Store it safely, separate from your Qards. For better obscurity, you can rename the file.
                                        </AlertDescription>
                                    </Alert>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Switch id="use-keyfile" checked={useKeyfile} onCheckedChange={setUseKeyfile} />
                      </div>
                      {useKeyfile && (
                        <div className="pt-2">
                          <Tabs defaultValue="generate" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="generate">Generate Keyfile</TabsTrigger>
                              <TabsTrigger value="upload">Upload Keyfile</TabsTrigger>
                            </TabsList>
                            <TabsContent value="generate" className="pt-4">
                              <KeyfileGenerator onKeyfileGenerated={setKeyfile} />
                            </TabsContent>
                            <TabsContent value="upload" className="pt-4">
                              <p className="text-sm text-muted-foreground mb-2">Select a file from your device to use as a keyfile. Any file will work, but larger, more random files are more secure.</p>
                              <KeyfileUpload onFileRead={setKeyfile} onFileNameChange={setKeyfileName} fileName={keyfileName} />
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
                                className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600"
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
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                        </PopoverTrigger>
                                        <PopoverContent className="text-sm">
                                        Add a label to your secret (e.g., "Inheritance Wallet", "Bitcoin Cold Storage"). This label will be encrypted along with your secret and will appear when you restore it.
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <Input id="label" placeholder="e.g., 'Inheritance Wallet'" value={label} onChange={(e) => setLabel(e.target.value)} />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="total-shares">Total Qards ({totalShares})</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                        </PopoverTrigger>
                                        <PopoverContent className="text-sm">
                                        <p className="font-bold mb-2">Total Qards</p>
                                        This is the total number of QR code backups (Qards) that will be created. You can distribute these among family members, lawyers, or secure physical locations.
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <Slider id="total-shares" min={1} max={10} step={1} value={[totalShares]} onValueChange={([val]) => setTotalShares(val)} />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="required-shares">Qards to Restore ({requiredShares})</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                        </PopoverTrigger>
                                        <PopoverContent className="text-sm">
                                        <p className="font-bold mb-2">Qards to Restore</p>
                                        This is the minimum number of Qards that must be brought together to recover the original secret. This is also known as the "threshold".
                                        <p className="mt-2 text-xs text-muted-foreground">For example, a 3-of-5 setup means you create 5 total Qards, but only need any 3 of them to restore your secret.</p>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <Slider id="required-shares" min={totalShares === 1 ? 1 : 2} max={totalShares} step={1} value={[requiredShares]} onValueChange={([val]) => setRequiredShares(val)} />
                            </div>
                        </div>
                      </div>
                    </div>
                </>
            )}
          </CardContent>
          {step >= 3 && (
              <CardFooter className="flex flex-col items-stretch gap-6 p-10 pt-0 animate-in fade-in duration-500">
                <Separator />
                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-6">
                  <Button size="lg" onClick={handleGenerate} disabled={isGenerateButtonDisabled} className="w-full sm:w-auto text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600">
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
                    <Popover>
                        <PopoverTrigger asChild>
                            <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                        </PopoverTrigger>
                        <PopoverContent className="text-sm">
                            <Alert variant="destructive">
                                <TriangleAlert className="h-4 w-4" />
                                <AlertTitle>CRITICAL: Secure Your Credentials!</AlertTitle>
                                <AlertDescription>
                                    You have successfully created your Qard backups. Your final step is to secure the password {keyfile ? 'and the keyfile' : ''} you used for encryption. Without them, these Qards are permanently useless. Do not proceed until you have saved your credentials.
                                </AlertDescription>
                            </Alert>
                        </PopoverContent>
                    </Popover>
                </div>
                <Button onClick={handleReset} className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600">
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Start Over
                </Button>
            </CardHeader>
             <CardContent className="p-10 pt-0">
                <QrCodeDisplay
                  qrCodeData={generatedQrData}
                  keyfileUsed={!!keyfile}
                />
            </CardContent>
        </>
      )}
    </Card>
  );
}


