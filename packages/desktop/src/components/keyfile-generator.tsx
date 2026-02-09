import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Download, File, Loader2, RefreshCw, TriangleAlert, Wand2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Buffer } from 'buffer';

interface KeyfileGeneratorProps {
  onKeyfileGenerated: (base64Keyfile: string | null) => void;
}

const KEYFILE_BYTE_LENGTH = 32; // 256 bits, a standard size for cryptographic keys

export function KeyfileGenerator({ onKeyfileGenerated }: KeyfileGeneratorProps) {
  const [keyfileData, setKeyfileData] = useState<string | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const { toast } = useToast();

  const handleGenerate = () => {
    try {
      const randomBytes = window.crypto.getRandomValues(new Uint8Array(KEYFILE_BYTE_LENGTH));
      const base64Keyfile = Buffer.from(randomBytes).toString('base64');
      
      setKeyfileData(base64Keyfile);
      onKeyfileGenerated(base64Keyfile);
      setIsGenerated(true);

      toast({
        title: 'Keyfile Generated & Applied',
        description: 'A new keyfile has been generated and is ready for the encryption process.',
      });
      // Automatically trigger download
      handleDownload(base64Keyfile);
    } catch (e) {
      console.error("Failed to generate random bytes for keyfile:", e);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: 'Could not generate a secure keyfile. Your browser may not support the required cryptographic functions.',
      });
    }
  };

  const handleDownload = (base64Data: string | null) => {
    if (!base64Data) return;
    
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'seqrets-keyfile.bin';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Keyfile Downloading',
        description: 'Your keyfile "seqrets-keyfile.bin" is downloading. Save it somewhere safe!',
      });
    } catch (e) {
        console.error("Failed to download keyfile:", e);
        toast({
            variant: 'destructive',
            title: 'Download Failed',
            description: 'Could not prepare the keyfile for download.',
        });
    }
  };

  const handleReset = () => {
    setKeyfileData(null);
    onKeyfileGenerated(null);
    setIsGenerated(false);
  };

  if (isGenerated && keyfileData) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between w-full p-3 border rounded-lg bg-green-500/10 border-green-500/30">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Keyfile Generated & Applied</span>
              <span className="text-xs text-muted-foreground">`seqrets-keyfile.bin`</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleDownload(keyfileData)}>
                <Download className="mr-2 h-4 w-4" /> Download Again
            </Button>
            <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8">
              <X className="h-5 w-5" />
              <span className="sr-only">Remove keyfile</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
            A keyfile is a file containing random data that acts as a second password. It provides a massive security boost.
        </p>
        <Button onClick={handleGenerate} className="w-full text-white bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600">
            <Wand2 className="mr-2 h-4 w-4" />
            Generate & Download Secure Keyfile
        </Button>
    </div>
  );
}

    