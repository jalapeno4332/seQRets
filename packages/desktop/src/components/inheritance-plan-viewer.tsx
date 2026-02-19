import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileDown, HardDrive } from 'lucide-react';
import { InheritancePlanForm } from '@/components/inheritance-plan-form';
import type { InheritancePlan } from '@/lib/inheritance-plan-types';

interface InheritancePlanViewerProps {
  plan: InheritancePlan;
  onSaveAsFile: () => void;
}

export function InheritancePlanViewer({ plan, onSaveAsFile }: InheritancePlanViewerProps) {
  const sizeEstimate = useMemo(() => {
    const bytes = new TextEncoder().encode(JSON.stringify(plan)).length;
    return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
  }, [plan]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Decrypted Inheritance Plan</h3>
          <p className="text-xs text-muted-foreground">Plan size: {sizeEstimate} (raw JSON)</p>
        </div>
        <Button variant="outline" size="sm" onClick={onSaveAsFile}>
          <FileDown className="h-4 w-4 mr-2" />
          Save as File
        </Button>
      </div>

      <Separator />

      <InheritancePlanForm
        plan={plan}
        onChange={() => {}}
        readOnly
      />
    </div>
  );
}
