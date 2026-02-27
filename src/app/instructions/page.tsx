'use client';

import React, { useState, useRef, useEffect, useTransition, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Lock, KeyRound, Eye, EyeOff, Paperclip, HelpCircle, Loader2, CheckCircle2, X, FileDown, ArrowDown, ShieldCheck, Download, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '../components/header';
import { InstructionsFileUpload } from '../components/instructions-file-upload';
import { KeyfileUpload } from '../components/keyfile-upload';
import { KeyfileGenerator } from '../components/keyfile-generator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PasswordGenerator } from '../components/password-generator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { RawInstruction, DecryptInstructionRequest } from '@/lib/types';
import { ConnectionStatus } from '../components/connection-status';

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
    cryptoWorkerRef.current = new Worker(new URL('@/lib/crypto.worker.ts', import.meta.url));

    cryptoWorkerRef.current.onmessage = (event: MessageEvent<{ type: string; payload: any }>) => {
      const { type, payload } = event.data;

      if (type === 'encryptInstructionsSuccess') {
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'seqrets-instructions.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({ title: 'Instructions Encrypted!', description: 'Your file "seqrets-instructions.json" is downloading.' });
        startEncryptTransition(() => {});
      } else if (type === 'encryptInstructionsError') {
        toast({ variant: 'destructive', title: 'Encryption Failed', description: payload.message || 'Could not encrypt the instructions file.' });
        startEncryptTransition(() => {});
      } else if (type === 'decryptInstructionsSuccess') {
        const { fileContent, fileName, fileType } = payload;
        const byteCharacters = atob(fileContent);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({ title: 'Instructions Decrypted!', description: `Your file "${fileName}" is downloading.` });
        startDecryptTransition(() => {});
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

  const handleEncryptReset = () => {
    setInstructionsFile(null);
    setEncryptPassword('');
    setEncryptUseKeyfile(false);
    setEncryptKeyfile(null);
    setEncryptKeyfileName(null);
    setIsEncryptPasswordValid(false);
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
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to App
            </Link>
          </Button>
        </div>
        <Header />

        <div className="text-center mb-10 pt-16 sm:pt-0">
          <div className="flex justify-center items-center gap-2.5 mb-6">
            <Image src="/icons/logo-light.png" alt="seQRets Logo" width={144} height={144} className="self-start -mt-2 dark:hidden" priority />
            <Image src="/icons/logo-dark.png" alt="seQRets Logo" width={144} height={144} className="self-start -mt-2 hidden dark:block" priority />
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
                <TabsTrigger value="encrypt"><Lock className="mr-2 h-4 w-4" /> Encrypt Plan</TabsTrigger>
                <TabsTrigger value="decrypt"><Download className="mr-2 h-4 w-4" /> Decrypt Plan</TabsTrigger>
              </TabsList>

              {/* ════════ Encrypt Tab ════════ */}
              <TabsContent value="encrypt" className="space-y-8">
                {/* Step 1: Upload File */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">1</div>
                    <h3 className="text-xl font-semibold">Upload Instructions File</h3>
                  </div>
                  <div className="sm:pl-11 space-y-4">
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
                      <div className="sm:pl-11 space-y-6">
                        {/* Password */}
                        <PasswordGenerator value={encryptPassword} onValueChange={setEncryptPassword} onValidationChange={setIsEncryptPasswordValid} placeholder="Enter the password used for your Qards or generate a new one" />

                        {/* Keyfile */}
                        <div className="space-y-4 rounded-md border p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Paperclip className="h-5 w-5" />
                              <Label htmlFor="use-keyfile-encrypt" className="text-base font-medium">Use a Keyfile</Label>
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
                            <Switch id="use-keyfile-encrypt" checked={encryptUseKeyfile} onCheckedChange={setEncryptUseKeyfile} />
                          </div>
                          {encryptUseKeyfile && (
                            <div className="pt-2">
                              <Tabs defaultValue="generate" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                  <TabsTrigger value="generate">Generate Keyfile</TabsTrigger>
                                  <TabsTrigger value="upload">Upload Keyfile</TabsTrigger>
                                </TabsList>
                                <TabsContent value="generate" className="pt-4">
                                  <KeyfileGenerator onKeyfileGenerated={setEncryptKeyfile} />
                                </TabsContent>
                                <TabsContent value="upload" className="pt-4">
                                  <p className="text-sm text-muted-foreground mb-2">Select a file from your device to use as a keyfile. Any file will work, but larger, more random files are more secure.</p>
                                  <KeyfileUpload onFileRead={setEncryptKeyfile} onFileNameChange={setEncryptKeyfileName} fileName={encryptKeyfileName} />
                                </TabsContent>
                              </Tabs>
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

                {/* Step 3: Encrypt & Download */}
                {encryptStep >= 3 && (
                  <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">3</div>
                        <h3 className="text-xl font-semibold">Encrypt & Download</h3>
                      </div>
                      <div className="sm:pl-11 space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Click the button below to encrypt your instructions file. The encrypted file will be downloaded as <code className="bg-muted px-1 py-0.5 rounded">seqrets-instructions.json</code>.
                        </p>
                        <div className="flex justify-end">
                          <Button
                            size="lg"
                            onClick={handleEncrypt}
                            disabled={isEncrypting || !instructionsFile || !isEncryptPasswordValid || (encryptUseKeyfile && !encryptKeyfile)}
                            className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                          >
                            {isEncrypting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
                            {isEncrypting ? 'Encrypting...' : 'Encrypt & Download'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ════════ Decrypt Tab ════════ */}
              <TabsContent value="decrypt" className="space-y-8">
                {/* Step 1: Upload encrypted file */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">1</div>
                    <h3 className="text-xl font-semibold">Upload Instructions File</h3>
                  </div>
                  <div className="sm:pl-11 space-y-4">
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
                          'group relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
                          isDragging ? 'border-primary bg-primary/10' : 'bg-muted border-muted-foreground/40 hover:bg-[#cbc5ba] hover:border-black dark:border-[#827b6f] dark:bg-muted dark:hover:bg-black dark:hover:border-[#827b6f]'
                        )}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleDecryptFileDrop}
                        onClick={() => document.getElementById('decrypt-instructions-input')?.click()}
                      >
                        <FileDown className="w-12 h-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">Drag & drop your encrypted instructions file here</p>
                        <p className="text-muted-foreground ">or click to browse</p>
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
                      <div className="sm:pl-11 space-y-6">
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
                                  If you attached a keyfile for extra security when encrypting the plan, you must enable this and upload the exact same file now to decrypt.
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Switch id="use-keyfile-decrypt" checked={decryptUseKeyfile} onCheckedChange={setDecryptUseKeyfile} />
                          </div>
                          {decryptUseKeyfile && (
                            <div className="pt-2">
                              <p className="text-sm text-muted-foreground mb-2">Select the exact same keyfile that was used to encrypt this plan. It will be a `.bin` file if generated by this app.</p>
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

                {/* Step 3: Decrypt & Download */}
                {decryptStep >= 3 && (
                  <div className="animate-in fade-in duration-500 space-y-8">
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-lg">3</div>
                        <h3 className="text-xl font-semibold">Decrypt & Download</h3>
                      </div>
                      <div className="sm:pl-11 space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Click the button below to decrypt the instructions file. The original file will be downloaded.
                        </p>
                        <div className="flex justify-end">
                          <Button
                            size="lg"
                            onClick={handleDecrypt}
                            disabled={isDecrypting || !decryptFile || !decryptPassword || (decryptUseKeyfile && !decryptKeyfile)}
                            className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                          >
                            {isDecrypting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileDown className="mr-2 h-5 w-5" />}
                            {isDecrypting ? 'Decrypting...' : 'Decrypt & Download'}
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

        <footer className="text-center text-sm text-muted-foreground mt-8 mb-16">
          <p>&copy; {new Date().getFullYear()} seQRets. All rights reserved.</p>
          <p className="mt-1">All data is processed locally. Your security is your responsibility.</p>
          <p className="mt-1"><ConnectionStatus /></p>
        </footer>
      </div>
    </main>
  );
}
