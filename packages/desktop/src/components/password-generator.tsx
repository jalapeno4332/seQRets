import { useTransition, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, KeyRound, Loader2, Wand2, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PasswordGeneratorProps {
  value: string;
  onValueChange: (value: string) => void;
  onValidationChange: (isValid: boolean) => void;
}

const validatePassword = (password: string): boolean => {
    if (password.length < 24) return false;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
    return hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
};


export function PasswordGenerator({ value, onValueChange, onValidationChange }: PasswordGeneratorProps) {
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
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const passwordLength = 32;
    const randomValues = new Uint32Array(passwordLength);
    window.crypto.getRandomValues(randomValues);
    let newPassword = '';
    for (let i = 0; i < passwordLength; i++) {
      newPassword += charset[randomValues[i] % charset.length];
    }
    return newPassword;
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
      navigator.clipboard.writeText(value);
      toast({
        title: 'Copied to clipboard!',
        description: 'Your password has been copied.',
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
        <Popover>
            <PopoverTrigger asChild>
                <button><HelpCircle className="h-4 w-4 text-primary" /></button>
            </PopoverTrigger>
            <PopoverContent className="text-sm">
                <ul className="list-disc space-y-1 pl-4">
                    <li>Must be at least 24 characters long.</li>
                    <li>Must include uppercase and lowercase letters.</li>
                    <li>Must include numbers.</li>
                    <li>Must include special symbols (e.g., !@#$%^&*).</li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Use the generator for a high-entropy, quantum-resistant password.</p>
            </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-grow">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input id="password" type={isPasswordVisible ? 'text' : 'password'} placeholder="Generate or enter a password" value={value} onChange={(e) => onValueChange(e.target.value)} className={cn("pl-10 pr-10", getBorderColor())} />
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
          className="text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 md:w-auto"
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
