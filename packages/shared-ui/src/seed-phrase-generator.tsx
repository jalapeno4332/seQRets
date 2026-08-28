'use client';

import { useState, useEffect, useMemo } from 'react';
import { copyWithAutoClear } from './clipboard-utils';
import { Button } from '@/components/ui/button';
import QRCode from 'qrcode';
import {
  generateMnemonic,
  validateMnemonic,
  bip39Wordlist as wordlist,
  masterFingerprint,
  toSeedQR,
  toCompactEntropy,
} from '@seqrets/crypto';
import { Copy, RefreshCw, CheckCircle, ShieldAlert, ArrowRight, Eye, EyeOff, QrCode } from 'lucide-react';
import { useToast } from './use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from './utils';

interface SeedPhraseGeneratorProps {
  onPhraseGenerated: (phrase: string) => void;
}

export function SeedPhraseGenerator({ onPhraseGenerated }: SeedPhraseGeneratorProps) {
  const [phrase, setPhrase] = useState('');
  const [wordCount, setWordCount] = useState<'12' | '24'>('12');
  const [isValid, setIsValid] = useState(false);
  const [isPhraseVisible, setIsPhraseVisible] = useState(false);
  // ── SeedQR panel state ──
  const [showSeedQr, setShowSeedQr] = useState(false);
  const [seedQrUri, setSeedQrUri] = useState<string | null>(null);
  const [seedQrFormat, setSeedQrFormat] = useState<'standard' | 'compact'>('standard');
  const [isSeedQrRevealed, setIsSeedQrRevealed] = useState(false);
  const { toast } = useToast();

  // BIP-32 master fingerprint (XFP) of the generated phrase — the same 8 hex
  // characters a hardware wallet shows after import, so the user can verify
  // the scan landed intact. mnemonicToSeedSync is ~2048 HMAC rounds, so
  // memoize per phrase.
  const fingerprint = useMemo(() => (isValid && phrase ? masterFingerprint(phrase) : null), [phrase, isValid]);

  // (Re)render the SeedQR whenever the panel is open and the phrase or
  // format changes. Same encoders and QR parameters as the restore dialog.
  useEffect(() => {
    if (!showSeedQr || !phrase || !isValid) return;
    let cancelled = false;
    const render = seedQrFormat === 'compact'
      ? QRCode.toDataURL([{ data: toCompactEntropy(phrase), mode: 'byte' }], { errorCorrectionLevel: 'L', margin: 2, width: 800 })
      : QRCode.toDataURL(toSeedQR(phrase), { errorCorrectionLevel: 'L', margin: 2, width: 800 });
    render.then((uri) => { if (!cancelled) setSeedQrUri(uri); }).catch(() => { if (!cancelled) setSeedQrUri(null); });
    return () => { cancelled = true; };
  }, [showSeedQr, phrase, isValid, seedQrFormat]);

  const handleGenerate = () => {
    const strength = wordCount === '12' ? 128 : 256;
    // Entropy comes straight from the OS CSPRNG: generateMnemonic pulls the full
    // 128/256 bits from @noble/hashes randomBytes → crypto.getRandomValues (no
    // Math.random / PRNG / time-seed; it throws rather than degrading), so a
    // phrase is never drawn from a search space smaller than its stated strength.
    const newPhrase = generateMnemonic(wordlist, strength);
    setPhrase(newPhrase);
    setIsValid(validateMnemonic(newPhrase, wordlist));
    // Everything sensitive re-hides on each new generation.
    setIsPhraseVisible(false);
    setShowSeedQr(false);
    setSeedQrUri(null);
    setIsSeedQrRevealed(false);
  };

  const handleCopy = () => {
    if (phrase) {
      copyWithAutoClear(phrase);
      toast({
        title: 'Copied to Clipboard!',
        description: 'Your seed phrase has been copied. Clipboard clears in 60s.',
      });
    }
  };

  const handleUsePhrase = () => {
    if (phrase && isValid) {
      onPhraseGenerated(phrase);
       toast({
        title: 'Seed Phrase Applied!',
        description: 'The generated phrase has been set as your secret.',
      });
    } else {
         toast({
            variant: 'destructive',
            title: 'Invalid Phrase',
            description: 'Cannot use an invalid or empty seed phrase.',
        });
    }
  };

  return (
    <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <RadioGroup defaultValue="12" onValueChange={(value: '12' | '24') => setWordCount(value)} className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="12" id="wc12" />
                    <Label htmlFor="wc12">12 Words</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="24" id="wc24" />
                    <Label htmlFor="wc24">24 Words</Label>
                </div>
            </RadioGroup>
             <Button onClick={handleGenerate} className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate New Phrase
            </Button>
        </div>
      
      {phrase && (
        <div className="space-y-3">
            <div className="relative">
                <div className={cn(
                    "p-4 rounded-md border-2 bg-background font-mono text-sm tracking-wider leading-relaxed transition-all",
                    isValid ? 'border-green-500' : 'border-red-500',
                    !isPhraseVisible && "blur-sm"
                )}>
                    {/* Floated spacer the size of the icon cluster: only the first
                        line yields to the icons; wrapped lines use the full width. */}
                    <span className="float-right h-7 w-28" aria-hidden="true" />
                    {phrase}
                </div>
                 <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsPhraseVisible(!isPhraseVisible)}
                      className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={isPhraseVisible ? 'Hide phrase' : 'Show phrase'}
                    >
                      {isPhraseVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Copy phrase"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSeedQr(v => !v)}
                      disabled={!isValid}
                      aria-pressed={showSeedQr}
                      className={cn(
                        "h-7 w-7 flex items-center justify-center transition-colors disabled:opacity-40",
                        showSeedQr ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-label={showSeedQr ? 'Hide SeedQR' : 'Show SeedQR'}
                    >
                      <QrCode size={18} />
                    </button>
                 </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                 <div className="flex flex-wrap items-center gap-y-1 text-sm">
                    {isValid ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500 shrink-0" />
                    ) : (
                        <ShieldAlert className="h-4 w-4 mr-2 text-red-500 shrink-0" />
                    )}
                    <span className={cn(isValid ? 'text-green-600' : 'text-red-600')}>
                        {isValid ? 'Valid Mnemonic Phrase' : 'Invalid Phrase'}
                    </span>
                    {fingerprint && (
                      <span
                        className="ml-3 text-xs text-muted-foreground"
                        title="BIP-32 master fingerprint with no BIP-39 passphrase. Most hardware wallets display this after import — it should match. Adding a BIP-39 passphrase at import time will produce a different fingerprint."
                      >
                        Fingerprint: <span className="font-mono font-semibold text-foreground">{fingerprint}</span>
                      </span>
                    )}
                 </div>
                 <Button onClick={handleUsePhrase} disabled={!isValid} className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md">
                    Use This Phrase
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>

            {showSeedQr && (
              <div className="space-y-3 rounded-md border bg-background p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                        {seedQrFormat === 'compact'
                          ? 'Compact SeedQR — encodes the raw entropy as bytes. Smaller, denser code.'
                          : 'Standard SeedQR — encodes each word as a numeric index.'}
                        {' '}Scan with a SeedQR-compatible signer to import this seed.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSeedQrFormat('standard')}
                          aria-pressed={seedQrFormat === 'standard'}
                          className={cn(
                            "text-xs transition-colors",
                            seedQrFormat === 'standard' ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Standard
                        </button>
                        <Switch
                          checked={seedQrFormat === 'compact'}
                          onCheckedChange={(on) => setSeedQrFormat(on ? 'compact' : 'standard')}
                          aria-label="Toggle between Standard and Compact SeedQR format"
                        />
                        <button
                          type="button"
                          onClick={() => setSeedQrFormat('compact')}
                          aria-pressed={seedQrFormat === 'compact'}
                          className={cn(
                            "text-xs transition-colors",
                            seedQrFormat === 'compact' ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Compact
                        </button>
                    </div>
                </div>
                <div className="relative">
                    {seedQrUri
                      ? <img
                          src={seedQrUri}
                          alt={seedQrFormat === 'compact' ? 'Compact SeedQR' : 'SeedQR'}
                          className={cn(
                            "mx-auto w-full max-w-[280px] rounded bg-white p-2 transition-all duration-300",
                            !isSeedQrRevealed && "blur-lg"
                          )}
                        />
                      : <div className="mx-auto h-[280px] max-w-[280px]" />}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 z-10 h-8 w-8 text-foreground bg-background/80 hover:bg-background shadow-sm"
                        onClick={() => setIsSeedQrRevealed(v => !v)}
                        aria-label={isSeedQrRevealed ? 'Hide SeedQR' : 'Show SeedQR'}
                    >
                        {isSeedQrRevealed ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </Button>
                </div>
                {fingerprint && (
                  <p className="text-center text-xs text-muted-foreground">
                    Verify after import: your device should show fingerprint{' '}
                    <span className="font-mono font-semibold text-foreground">{fingerprint}</span>.
                  </p>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
