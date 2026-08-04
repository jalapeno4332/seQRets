
'use client';

import { useTransition, useEffect, useState } from 'react';
import { copyWithAutoClear } from './clipboard-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, KeyRound, Loader2, Wand2, Eye, EyeOff } from 'lucide-react';
import { useToast } from './use-toast';
import { cn } from './utils';
import { HelpHint } from '@/components/ui/help-hint';

interface PasswordGeneratorProps {
  value: string;
  onValueChange: (value: string) => void;
  onValidationChange: (isValid: boolean) => void;
  placeholder?: string;
}

const validatePassword = (password: string): boolean => {
    if (password.length < 24) return false;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
    return hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
};


export function PasswordGenerator({ value, onValueChange, onValidationChange, placeholder = 'Generate or enter a password' }: PasswordGeneratorProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [isValid, setIsValid] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    const valid = validatePassword(value);
    setIsValid(valid);
    onValidationChange(valid);
  }, [value, onValidationChange]);


  const generateSecurePassword = () => {
    // Generate a high-entropy password locally using browser crypto
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const charset = lower + upper + digits + special;
    const passwordLength = 32;
    // Two independent draws: one picks the characters, the other drives the
    // shuffle. Reusing a single array for both would make a character's
    // identity and its final position deterministically linked.
    const randomValues = new Uint32Array(passwordLength);
    const shuffleValues = new Uint32Array(passwordLength);
    window.crypto.getRandomValues(randomValues);
    window.crypto.getRandomValues(shuffleValues);

    // Guarantee at least one character from each required class
    const mandatory = [
      lower[randomValues[0] % lower.length],
      upper[randomValues[1] % upper.length],
      digits[randomValues[2] % digits.length],
      special[randomValues[3] % special.length],
    ];

    // Fill remaining slots from the full charset
    for (let i = 4; i < passwordLength; i++) {
      mandatory.push(charset[randomValues[i] % charset.length]);
    }

    // Fisher-Yates shuffle so mandatory chars aren't always at the start
    for (let i = mandatory.length - 1; i > 0; i--) {
      const j = shuffleValues[i] % (i + 1);
      [mandatory[i], mandatory[j]] = [mandatory[j], mandatory[i]];
    }

    return mandatory.join('');
  };

  const handleGenerate = () => {
    startTransition(() => {
      const newPassword = generateSecurePassword();
      onValueChange(newPassword);
      toast({
        title: 'Password Generated',
        description: 'A new high-entropy password has been generated.',
      });
    });
  };

  const handleCopy = () => {
    if (value) {
      copyWithAutoClear(value);
      toast({
        title: 'Copied to clipboard!',
        description: 'Your password has been copied. Clipboard clears in 60s.',
      });
    }
  };

  const getBorderColor = () => {
    if (!value) return ''; // Default border
    return isValid ? 'border-green-500 focus-visible:ring-green-500' : 'border-red-500 focus-visible:ring-red-500';
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="password">Required Password</Label>
        <HelpHint label="Help: password requirements">
            <ul className="list-disc space-y-1 pl-4">
                <li>Must be at least 24 characters long.</li>
                <li>Must include uppercase and lowercase letters.</li>
                <li>Must include numbers.</li>
                <li>Must include special symbols (e.g., !@#$%^&*).</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Use the generator for a high-entropy password that resists Grover-accelerated brute-force.</p>
        </HelpHint>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-grow">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input id="password" type={isPasswordVisible ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={(e) => onValueChange(e.target.value)} className={cn("pl-10 pr-10", getBorderColor())} />
           <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            {isPasswordVisible ? <EyeOff /> : <Eye />}
          </button>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={handleCopy} disabled={!value} aria-label="Copy password">
          <Copy className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md md:w-auto"
        >
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Wand2 className="h-5 w-5 md:mr-2" />
          )}
          <span className="hidden md:inline">Generate</span>
        </Button>
      </div>
    </div>
  );
}
