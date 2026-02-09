
'use client';

import { useState, useRef, DragEvent, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileUp, FileText, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface InstructionsFileUploadProps {
  onFileSelected: (file: File | null) => void;
  selectedFile: File | null;
}

export function InstructionsFileUpload({ onFileSelected, selectedFile }: InstructionsFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
            variant: 'destructive',
            title: 'File Too Large',
            description: 'The instructions file size cannot exceed 5MB.',
        });
        onFileSelected(null);
        return;
    }
    onFileSelected(file);
    toast({
      title: 'Instructions File Selected',
      description: `${file.name} has been loaded and is ready for encryption.`,
    });
  }, [onFileSelected, toast]);

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
    }
  }, [handleFile]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    onFileSelected(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast({
        title: 'Instructions File Removed',
        description: `The instructions file has been cleared.`,
    });
  };

  if (selectedFile) {
    return (
        <div className="flex items-center justify-between w-full p-3 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-6 h-6 text-primary flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">Instructions loaded successfully.</span>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleRemoveFile} className="h-8 w-8 flex-shrink-0">
                <X className="h-5 w-5" />
                <span className="sr-only">Remove instructions file</span>
            </Button>
        </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
        isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-muted'
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={openFileDialog}
    >
      <FileUp className="w-10 h-10 text-muted-foreground mb-3" />
      <p className="text-base font-medium">Drag & drop your instructions file here</p>
      <p className="text-sm text-muted-foreground">or click to select a file (5MB limit)</p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".txt,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />
    </div>
  );
}
