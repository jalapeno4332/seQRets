
'use client';

import { useState, useRef, DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { Camera, FileUp, TextCursorInput } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFilesAdded: (files: File[]) => void;
  onCameraOpen: () => void;
  onManualOpen: () => void;
}

export function FileUpload({ onFilesAdded, onCameraOpen, onManualOpen }: FileUploadProps) {
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
                'relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out',
                isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-muted'
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={openFileDialog}
        >
            <FileUp className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Drag & drop QR code images here</p>
            <p className="text-muted-foreground">or click to browse files</p>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
            />
        </div>
        <div className="flex justify-center items-center gap-2">
            <p className="text-sm text-muted-foreground">or use another method:</p>
             <Button variant="outline" onClick={onManualOpen}>
                <TextCursorInput className="mr-2 h-4 w-4" />
                Manual Text Entry
            </Button>
            <Button variant="outline" onClick={onCameraOpen}>
                <Camera className="mr-2 h-4 w-4" />
                Scan with Camera
            </Button>
        </div>
    </div>
  );
}
