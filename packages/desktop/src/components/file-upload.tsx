import { useState, useRef, DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { Camera, CreditCard, FileUp, FolderOpen, TextCursorInput } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFilesAdded: (files: File[]) => void;
  onCameraOpen: () => void;
  onManualOpen: () => void;
  onImportVault?: () => void;
  onSmartCardRead?: () => void;
}

export function FileUpload({ onFilesAdded, onCameraOpen, onManualOpen, onImportVault, onSmartCardRead }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      onFilesAdded(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files && files.length > 0) {
      onFilesAdded(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
        <div
            className={cn(
                'group relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
                isDragging ? 'bg-[#cbc5ba] border-black dark:bg-black dark:border-[#827b6f]' : 'bg-muted border-muted-foreground/40 hover:bg-[#cbc5ba] hover:border-black dark:border-[#827b6f] dark:bg-muted dark:hover:bg-black dark:hover:border-[#827b6f]'
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={openFileDialog}
        >
            <FileUp className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Drag & drop QR code images here</p>
            <p className="text-muted-foreground ">or click to browse files</p>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
            />
        </div>
        <p className="text-xs text-muted-foreground text-center">or use another method:</p>
        <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" onClick={onManualOpen} className="w-full text-xs px-2 dark-thin-border dark:bg-[#232122] dark:text-white dark:border-black dark:hover:bg-[#605c53] dark:hover:text-white dark:hover:border-black">
                <TextCursorInput className="mr-1.5 h-4 w-4 shrink-0" />
                Paste Text
            </Button>
            <Button variant="outline" onClick={onCameraOpen} className="w-full text-xs px-2 dark-thin-border dark:bg-[#232122] dark:text-white dark:border-black dark:hover:bg-[#605c53] dark:hover:text-white dark:hover:border-black">
                <Camera className="mr-1.5 h-4 w-4 shrink-0" />
                Scan QR
            </Button>
            {onImportVault && (
              <Button variant="outline" onClick={onImportVault} className="w-full text-xs px-2 dark-thin-border dark:bg-[#232122] dark:text-white dark:border-black dark:hover:bg-[#605c53] dark:hover:text-white dark:hover:border-black">
                  <FolderOpen className="mr-1.5 h-4 w-4 shrink-0" />
                  Import Vault
              </Button>
            )}
            {onSmartCardRead && (
              <Button variant="outline" onClick={onSmartCardRead} className="w-full text-xs px-2 dark-thin-border bg-[#cbc5ba] border-[#cbc5ba] hover:bg-[#b5ad9f] hover:border-[#b5ad9f] dark:bg-[#605c53] dark:text-white dark:border-black dark:hover:bg-[#232122] dark:hover:text-white dark:hover:border-black">
                  <CreditCard className="mr-1.5 h-4 w-4 shrink-0" />
                  Smart Card
              </Button>
            )}
        </div>
    </div>
  );
}
