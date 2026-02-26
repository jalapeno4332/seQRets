import { useState, useRef, DragEvent, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileUp, File, X, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface KeyfileUploadProps {
  onFileRead: (fileContent: string | null) => void;
  onFileNameChange: (fileName: string | null) => void;
  fileName: string | null;
  onSmartCardLoad?: () => void;
}

export function KeyfileUpload({ onFileRead, onFileNameChange, fileName, onSmartCardLoad }: KeyfileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = useCallback((file: File) => {
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({
            variant: 'destructive',
            title: 'File Too Large',
            description: 'The keyfile size cannot exceed 2MB.',
        });
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer;
      // Safe Base64 conversion for large files using chunking
      const u8 = new Uint8Array(result);
      const CHUNK_SIZE = 0x8000; // 32k
      let binary = '';
      for (let i = 0; i < u8.length; i += CHUNK_SIZE) {
        const chunk = u8.subarray(i, i + CHUNK_SIZE);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      const b64 = btoa(binary);

      onFileRead(b64);
      onFileNameChange(file.name);
      toast({
        title: 'Keyfile Selected',
        description: `${file.name} has been loaded.`,
      });
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'File Read Error',
        description: `Could not read the file ${file.name}.`,
      });
      onFileRead(null);
      onFileNameChange(null);
    };
    reader.readAsArrayBuffer(file);
  }, [onFileRead, onFileNameChange, toast]);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      handleFile(files[0]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files && files.length > 0) {
      handleFile(files[0]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [handleFile]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    onFileRead(null);
    onFileNameChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast({
        title: 'Keyfile Removed',
        description: `The keyfile has been cleared.`,
      });
  };

  if (fileName) {
    return (
        <div className="flex items-center justify-between w-full p-3 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
                <File className="w-6 h-6 text-primary" />
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{fileName}</span>
                    <span className="text-xs text-muted-foreground">Keyfile loaded successfully.</span>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} className="h-8 w-8">
                <X className="h-5 w-5" />
                <span className="sr-only">Remove keyfile</span>
            </Button>
        </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
        isDragging ? 'bg-[#cbc5ba] border-black dark:bg-black dark:border-[#827b6f]' : 'bg-muted border-muted-foreground/40 hover:bg-[#cbc5ba] hover:border-black dark:border-[#827b6f] dark:bg-muted dark:hover:bg-black dark:hover:border-[#827b6f]'
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={openFileDialog}
    >
      <FileUp className="w-10 h-10 text-muted-foreground mb-3" />
      <p className="text-base font-medium">Drag & drop your keyfile here</p>
      <p className="text-sm text-muted-foreground ">or click to select a file (2MB limit)</p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".bin,.key"
      />
      {onSmartCardLoad && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onSmartCardLoad();
          }}
          className="mt-3 text-xs px-2 bg-[#cbc5ba] border-[#cbc5ba] hover:bg-[#b5ad9f] hover:border-[#b5ad9f] dark:bg-[#605c53] dark:text-white dark:border-black dark:hover:bg-[#232122] dark:hover:text-white dark:hover:border-black"
        >
          <CreditCard className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          Smart Card
        </Button>
      )}
    </div>
  );
}
