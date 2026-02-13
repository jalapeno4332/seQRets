import React, { useState, useRef, useEffect, useTransition, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Lock, KeyRound, Eye, EyeOff, Paperclip, HelpCircle, Loader2, CheckCircle2, X, FileDown, ArrowDown, ShieldCheck, Download, CreditCard, RefreshCcw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/components/theme-provider';
import { Header } from '@/components/header';
import { InstructionsFileUpload } from '@/components/instructions-file-upload';
import { KeyfileUpload } from '@/components/keyfile-upload';
import { PasswordGenerator } from '@/components/password-generator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { RawInstruction, DecryptInstructionRequest, EncryptedInstruction } from '@/lib/types';
import { SmartCardDialog } from '@/components/smartcard-dialog';
import { saveFileNative, saveTextFileNative, base64ToUint8Array } from '@/lib/native-save';
import logoLight from '@/assets/icons/logo-light.png';
import logoDark from '@/assets/icons/logo-dark.png';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function InstructionsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const logoSrc = isDark ? logoDark : logoLight;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('encrypt');

  // ── Encrypt state ──
  const [encryptStep, setEncryptStep] = useState(1);
  const [instructionsFile, setInstructionsFile] = useState<File | null>(null);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptUseKeyfile, setEncryptUseKeyfile] = useState(false);
  const [encryptKeyfile, setEncryptKeyfile] = useState<string | null>(null);
  const [encryptKeyfileName, setEncryptKeyfileName] = useState<string | null>(null);
  const [isEncryptPasswordValid, setIsEncryptPasswordValid] = useState(false);
  const [isEncrypting, startEncryptTransition] = useTransition();
  const [encryptedResult, setEncryptedResult] = useState<EncryptedInstruction | null>(null);
  const [showSmartCardDialog, setShowSmartCardDialog] = useState(false);

  // ── Decrypt state ──
  const [decryptStep, setDecryptStep] = useState(1);
  const [decryptFile, setDecryptFile] = useState<File | null>(null);
  const [decryptFileName, setDecryptFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [decryptPasswordVisible, setDecryptPasswordVisible] = useState(false);
  const [decryptUseKeyfile, setDecryptUseKeyfile] = useState(false);
  const [decryptKeyfile, setDecryptKeyfile] = useState<string | null>(null);
  const [decryptKeyfileName, setDecryptKeyfileName] = useState<string | null>(null);
  const [isDecrypting, startDecryptTransition] = useTransition();

  const cryptoWorkerRef = useRef<Worker>();

  useEffect(() => {
    cryptoWorkerRef.current = new Worker(new URL('@/lib/crypto.worker.ts', import.meta.url), { type: 'module' });

    cryptoWorkerRef.current.onmessage = (event: MessageEvent<{ type: string; payload: any }>) => {
      const { type, payload } = event.data;

      if (type === 'encryptInstructionsSuccess') {
        setEncryptedResult(payload as EncryptedInstruction);
        setEncryptStep(4);
        toast({ title: 'Instructions Encrypted!', description: 'Choose how to save your encrypted instructions below.' });
        startEncryptTransition(() => {});
      } else if (type === 'encryptInstructionsError') {
        toast({ variant: 'destructive', title: 'Encryption Failed', description: payload.message || 'Could not encrypt the instructions file.' });
        startEncryptTransition(() => {});
      } else if (type === 'decryptInstructionsSuccess') {
        const handleSave = async () => {
          const { fileContent, fileName } = payload;
          const byteArray = base64ToUint8Array(fileContent);
          const ext = fileName.split('.').pop() || '*';
          const filters = [{ name: `${ext.toUpperCase()} Files`, extensions: [ext] }];
          const savedPath = await saveFileNative(fileName, filters, byteArray);
          if (savedPath) {
            toast({ title: 'Instructions Decrypted!', description: `Saved "${fileName}" successfully.` });
          }
          startDecryptTransition(() => {});
        };
        handleSave();
      } else if (type === 'decryptInstructionsError') {
        toast({ variant: 'destructive', title: 'Decryption Failed', description: payload.message || 'Could not decrypt the instructions file.' });
        startDecryptTransition(() => {});
      }
    };

    return () => {
      cryptoWorkerRef.current?.terminate();
    };
  }, []);

  // ── Encrypt handlers ──
  const handleEncrypt = async () => {
    if (!instructionsFile || !encryptPassword || !isEncryptPasswordValid) return;
    if (encryptUseKeyfile && !encryptKeyfile) {
      toast({ variant: 'destructive', title: 'Missing Keyfile', description: 'Please select a keyfile or disable the keyfile option.' });
      return;
    }

    const base64Content = await fileToBase64(instructionsFile);
    const instruction: RawInstruction = {
      fileName: instructionsFile.name,
      fileContent: base64Content,
      fileType: instructionsFile.type || 'application/octet-stream',
    };
    startEncryptTransition(() => {
      cryptoWorkerRef.current?.postMessage({
        type: 'encryptInstructions',
        payload: {
          instructions: instruction,
          password: encryptPassword,
          keyfile: encryptUseKeyfile ? encryptKeyfile : undefined,
        },
      });
    });
  };

  const handleSaveToFile = async () => {
    if (!encryptedResult) return;
    const jsonStr = JSON.stringify(encryptedResult, null, 2);
    const savedPath = await saveTextFileNative(
      'seqrets-instructions.json',
      [{ name: 'JSON Files', extensions: ['json'] }],
      jsonStr,
    );
    if (savedPath) {
      toast({ title: 'File Saved!', description: 'Saved "seqrets-instructions.json" successfully.' });
    }
  };

  const handleEncryptReset = () => {
    setInstructionsFile(null);
    setEncryptPassword('');
    setEncryptUseKeyfile(false);
    setEncryptKeyfile(null);
    setEncryptKeyfileName(null);
    setIsEncryptPasswordValid(false);
    setEncryptedResult(null);
    setShowSmartCardDialog(false);
    setEncryptStep(1);
  };

  // ── Decrypt handlers ──
  const handleDecryptFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleDecryptFileSelect(file);
  };

  const handleDecryptFileSelect = (file: File) => {
    if (file && file.type === 'application/json') {
      setDecryptFile(file);
      setDecryptFileName(file.name);
    } else {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Please upload a .json instructions file.' });
    }
  };

  const handleDecrypt = () => {
    if (!decryptFile || !decryptPassword) return;
    if (decryptUseKeyfile && !decryptKeyfile) {
      toast({ variant: 'destructive', title: 'Missing Keyfile', description: 'Please select a keyfile or disable the keyfile option.' });
      return;
    }

    startDecryptTransition(() => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const encryptedData = e.target?.result as string;
        const request: DecryptInstructionRequest = {
          encryptedData,
          password: decryptPassword,
          keyfile: decryptUseKeyfile ? decryptKeyfile ?? undefined : undefined,
        };
        cryptoWorkerRef.current?.postMessage({ type: 'decryptInstructions', payload: request });
      };
      reader.readAsText(decryptFile);
    });
  };

  const handleDecryptReset = () => {
    setDecryptFile(null);
    setDecryptFileName(null);
    setDecryptPassword('');
    setDecryptPasswordVisible(false);
    setDecryptUseKeyfile(false);
    setDecryptKeyfile(null);
    setDecryptKeyfileName(null);
    setDecryptStep(1);
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
      <div className="w-full max-w-4xl mx-auto relative">
        <div className="absolute top-4 left-4 z-50">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to App
            </Link>
          </Button>
        </div>
        <Header />

        <div className="text-center mb-10 pt-16 sm:pt-0">
          <div className="flex justify-center items-center gap-2.5 mb-6">
            <img src={logoSrc} alt="seQRets Logo" width={144} height={144} className="self-start -mt-2" />
            <div>
              <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
                seQRets
              </h1>
              <p className="text-right text-base font-bold text-foreground tracking-wide">
                Secure. Split. Share.
              </p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Inheritance Plan</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Encrypt a document with instructions for your heirs, or decrypt a previously encrypted file.
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="p-6 pt-6">
            <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); handleEncryptReset(); handleDecryptReset(); }}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="encrypt"><Lock className="mr-2 h-4 w-4" /> Encrypt Instructions</TabsTrigger>
                <TabsTrigger value="decrypt"><Download className="mr-2 h-4 w-4" /> Decrypt Instructions</TabsTrigger>
              </TabsList>

              {/* ════════ Encrypt Tab ════════ */}
              <TabsContent value="encrypt" className="space-y-8">
                {/* Step 1: Upload File */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">1</div>
                    <h3 className="text-xl font-semibold">Upload Instructions File</h3>
                  </div>
                  <div className="pl-11 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Select the file you want to encrypt (e.g. a pdf, docx, odt or txt file with instructions for your heirs). Max 5MB.
                    </p>
                    <InstructionsFileUpload onFileSelected={setInstructionsFile} selectedFile={instructionsFile} />
                    {encryptStep === 1 && (
                      <div className="flex justify-end pt-2">
                        <Button onClick={() => setEncryptStep(2)} disabled={!instructionsFile} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                          Next Step <ArrowDown className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Credentials */}
                {encryptStep >= 2 && (
                  <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">2</div>
                        <h3 className="text-xl font-semibold">Provide Credentials</h3>
                      </div>
                      <div className="pl-11 space-y-6">
                        {/* Password */}
                        <PasswordGenerator value={encryptPassword} onValueChange={setEncryptPassword} onValidationChange={setIsEncryptPasswordValid} placeholder="Enter the password used for your Qards or generate a new one" />

                        {/* Keyfile */}
                        <div className="space-y-4 rounded-md border p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Paperclip className="h-5 w-5" />
                              <Label htmlFor="use-keyfile-encrypt" className="text-base font-medium">Keyfile</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="text-sm">
                                  Optional: add a keyfile for additional security. You will need this same keyfile to decrypt.
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Switch id="use-keyfile-encrypt" checked={encryptUseKeyfile} onCheckedChange={setEncryptUseKeyfile} />
                          </div>
                          {encryptUseKeyfile && (
                            <div className="pt-2">
                              <KeyfileUpload onFileRead={setEncryptKeyfile} onFileNameChange={setEncryptKeyfileName} fileName={encryptKeyfileName} />
                            </div>
                          )}
                        </div>

                        {encryptStep === 2 && (
                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={() => setEncryptStep(3)}
                              disabled={!isEncryptPasswordValid || (encryptUseKeyfile && !encryptKeyfile)}
                              className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                            >
                              Next Step <ArrowDown className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Encrypt */}
                {encryptStep === 3 && (
                  <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">3</div>
                        <h3 className="text-xl font-semibold">Encrypt</h3>
                      </div>
                      <div className="pl-11 space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Click the button below to encrypt your instructions file.
                        </p>
                        <div className="flex justify-end">
                          <Button
                            size="lg"
                            onClick={handleEncrypt}
                            disabled={isEncrypting || !instructionsFile || !isEncryptPasswordValid || (encryptUseKeyfile && !encryptKeyfile)}
                            className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                          >
                            {isEncrypting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
                            {isEncrypting ? 'Encrypting...' : 'Encrypt'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Save / Write to Card */}
                {encryptStep >= 4 && encryptedResult && (() => {
                  const encryptedJson = JSON.stringify(encryptedResult);
                  const encryptedSizeBytes = new TextEncoder().encode(encryptedJson).length;
                  const fitsOnCard = encryptedSizeBytes <= 8192;
                  const sizeDisplay = encryptedSizeBytes < 1024
                    ? `${encryptedSizeBytes} bytes`
                    : `${(encryptedSizeBytes / 1024).toFixed(1)} KB`;

                  return (
                    <div className="animate-in fade-in duration-500 space-y-8">
                      <Separator />
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-600 text-white font-bold text-lg">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                          <h3 className="text-xl font-semibold">Encryption Complete</h3>
                        </div>
                        <div className="pl-11 space-y-4">
                          <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                            <p className="text-sm font-medium text-green-500">Your instructions have been encrypted successfully.</p>
                            <p className="text-xs text-muted-foreground">Encrypted size: {sizeDisplay}</p>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <Button
                              size="lg"
                              onClick={handleSaveToFile}
                              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                            >
                              <Save className="mr-2 h-5 w-5" />
                              Save to File
                            </Button>
                            <Button
                              size="lg"
                              onClick={() => setShowSmartCardDialog(true)}
                              disabled={!fitsOnCard}
                              variant="outline"
                              className="flex-1"
                            >
                              <CreditCard className="mr-2 h-5 w-5" />
                              Write to Smart Card
                            </Button>
                          </div>

                          {!fitsOnCard ? (
                            <p className="text-xs text-muted-foreground">
                              Encrypted file ({sizeDisplay}) exceeds the 8 KB smart card limit. Use Save to File instead.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              The item will be appended to any existing data on the card.
                            </p>
                          )}

                          <div className="flex justify-end pt-2">
                            <Button variant="ghost" size="sm" onClick={handleEncryptReset}>
                              <RefreshCcw className="mr-2 h-4 w-4" />
                              Start Over
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              {/* ════════ Decrypt Tab ════════ */}
              <TabsContent value="decrypt" className="space-y-8">
                {/* Step 1: Upload encrypted file */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">1</div>
                    <h3 className="text-xl font-semibold">Upload Instructions File</h3>
                  </div>
                  <div className="pl-11 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload the encrypted <code className="bg-muted px-1 py-0.5 rounded">seqrets-instructions.json</code> file.
                    </p>
                    {decryptFileName ? (
                      <div className="flex items-center justify-between w-full p-3 border rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-6 h-6 text-green-500" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{decryptFileName}</span>
                            <span className="text-xs text-muted-foreground">File ready for decryption.</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => { setDecryptFile(null); setDecryptFileName(null); }} className="h-8 w-8">
                          <X className="h-5 w-5" />
                          <span className="sr-only">Remove file</span>
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
                          isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-muted'
                        )}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleDecryptFileDrop}
                        onClick={() => document.getElementById('decrypt-instructions-input')?.click()}
                      >
                        <FileDown className="w-12 h-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">Drag & drop your encrypted instructions file here</p>
                        <p className="text-muted-foreground">or click to browse</p>
                        <input
                          id="decrypt-instructions-input"
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => e.target.files && handleDecryptFileSelect(e.target.files[0])}
                        />
                      </div>
                    )}
                    {decryptStep === 1 && (
                      <div className="flex justify-end pt-2">
                        <Button onClick={() => setDecryptStep(2)} disabled={!decryptFile} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                          Next Step <ArrowDown className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Credentials */}
                {decryptStep >= 2 && (
                  <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">2</div>
                        <h3 className="text-xl font-semibold">Provide Your Credentials</h3>
                      </div>
                      <div className="pl-11 space-y-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="decrypt-password">Password</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                              </PopoverTrigger>
                              <PopoverContent className="text-sm">
                                Enter the same password that was used when the instructions were encrypted.
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                              id="decrypt-password"
                              type={decryptPasswordVisible ? 'text' : 'password'}
                              placeholder="Enter the password used for encryption"
                              value={decryptPassword}
                              onChange={(e) => setDecryptPassword(e.target.value)}
                              className="pl-10 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setDecryptPasswordVisible(!decryptPasswordVisible)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                            >
                              {decryptPasswordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-md border p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Paperclip className="h-5 w-5" />
                              <Label htmlFor="use-keyfile-decrypt" className="text-base font-medium">Was a Keyfile used?</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button><HelpCircle className="h-4 w-4 text-primary" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="text-sm">
                                  If a keyfile was used when encrypting the instructions, enable this and upload the same keyfile.
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Switch id="use-keyfile-decrypt" checked={decryptUseKeyfile} onCheckedChange={setDecryptUseKeyfile} />
                          </div>
                          {decryptUseKeyfile && (
                            <div className="pt-2">
                              <KeyfileUpload onFileRead={setDecryptKeyfile} onFileNameChange={setDecryptKeyfileName} fileName={decryptKeyfileName} />
                            </div>
                          )}
                        </div>

                        {decryptStep === 2 && (
                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={() => setDecryptStep(3)}
                              disabled={!decryptPassword || (decryptUseKeyfile && !decryptKeyfile)}
                              className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                            >
                              Next Step <ArrowDown className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Decrypt & Save */}
                {decryptStep >= 3 && (
                  <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">3</div>
                        <h3 className="text-xl font-semibold">Decrypt & Save</h3>
                      </div>
                      <div className="pl-11 space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Click the button below to decrypt the instructions file. You will be prompted to save the decrypted file.
                        </p>
                        <div className="flex justify-end">
                          <Button
                            size="lg"
                            onClick={handleDecrypt}
                            disabled={isDecrypting || !decryptFile || !decryptPassword || (decryptUseKeyfile && !decryptKeyfile)}
                            className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                          >
                            {isDecrypting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileDown className="mr-2 h-5 w-5" />}
                            {isDecrypting ? 'Decrypting...' : 'Decrypt & Save'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <footer className="text-center text-sm text-muted-foreground pb-8">
          <p>&copy; {new Date().getFullYear()} seQRets. All rights reserved.</p>
          <p className="mt-1">Your security is your responsibility. Use with caution.</p>
        </footer>
      </div>

      {/* Smart Card Dialog for writing encrypted instructions */}
      <SmartCardDialog
        open={showSmartCardDialog}
        onOpenChange={setShowSmartCardDialog}
        mode="write-vault"
        writeData={encryptedResult ? JSON.stringify(encryptedResult) : undefined}
        writeLabel="Inheritance Plan"
        writeItemType="instructions"
      />
    </main>
  );
}
