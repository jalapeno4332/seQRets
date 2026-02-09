
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { Copy, RefreshCw, CheckCircle, ShieldAlert, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface SeedPhraseGeneratorProps {
  onPhraseGenerated: (phrase: string) => void;
}

export function SeedPhraseGenerator({ onPhraseGenerated }: SeedPhraseGeneratorProps) {
  const [phrase, setPhrase] = useState('');
  const [wordCount, setWordCount] = useState<'12' | '24'>('12');
  const [isValid, setIsValid] = useState(false);
  const [isPhraseVisible, setIsPhraseVisible] = useState(false);
  const { toast } = useToast();

  const handleGenerate = () => {
    const strength = wordCount === '12' ? 128 : 256;
    const newPhrase = generateMnemonic(wordlist, strength);
    setPhrase(newPhrase);
    setIsValid(validateMnemonic(newPhrase, wordlist));
    setIsPhraseVisible(false); // Keep it blurred on new generation
  };

  const handleCopy = () => {
    if (phrase) {
      navigator.clipboard.writeText(phrase);
      toast({
        title: 'Copied to Clipboard!',
        description: 'Your seed phrase has been copied.',
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
             <Button onClick={handleGenerate} className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600">
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate New Phrase
            </Button>
        </div>
      
      {phrase && (
        <div className="space-y-4">
            <div className="relative">
                <div className={cn(
                    "p-4 rounded-md border-2 bg-background font-mono text-sm tracking-wider leading-relaxed transition-all",
                    isValid ? 'border-green-500' : 'border-red-500',
                    !isPhraseVisible && "blur-sm"
                )}>
                    {phrase}
                </div>
                 <button
                  type="button"
                  onClick={() => setIsPhraseVisible(!isPhraseVisible)}
                  className="absolute top-2 right-2 h-7 w-7 text-muted-foreground"
                  aria-label={isPhraseVisible ? 'Hide phrase' : 'Show phrase'}
                >
                  {isPhraseVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>

            <div className="flex justify-between items-center">
                 <div className="flex items-center text-sm">
                    {isValid ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                        <ShieldAlert className="h-4 w-4 mr-2 text-red-500" />
                    )}
                    <span className={cn(isValid ? 'text-green-600' : 'text-red-600')}>
                        {isValid ? 'Valid Mnemonic Phrase' : 'Invalid Phrase'}
                    </span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handleCopy}>
                        <Copy className="h-5 w-5" />
                        <span className="sr-only">Copy Phrase</span>
                    </Button>
                     <Button onClick={handleUsePhrase} disabled={!isValid} className="bg-green-600 hover:bg-green-700 text-white">
                        Use This Phrase
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
