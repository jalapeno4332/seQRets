/**
 * SmartCardDialog — Shared dialog for reading/writing to JavaCard smartcards.
 *
 * Modes:
 *  - "write-share": Write a single Shamir share to a card
 *  - "write-vault": Write a full vault to a card
 *  - "read":        Read a share or vault from a card
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, ShieldCheck, AlertTriangle, Trash2, CheckCircle2, Lock, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  listReaders,
  getCardStatus,
  writeShareToCard,
  writeVaultToCard,
  readCard,
  eraseCard,
  verifyPin,
  setPin,
  CardStatus,
  CardData,
} from '@/lib/smartcard';

export type SmartCardMode = 'write-share' | 'write-vault' | 'read';

interface SmartCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SmartCardMode;
  /** Data to write (share string or vault JSON). Required for write modes. */
  writeData?: string;
  /** Label for the data being written. */
  writeLabel?: string;
  /** Callback when data is successfully read from the card. */
  onDataRead?: (data: CardData) => void;
}

export function SmartCardDialog({
  open,
  onOpenChange,
  mode,
  writeData,
  writeLabel = '',
  onDataRead,
}: SmartCardDialogProps) {
  const { toast } = useToast();

  // Reader state
  const [readers, setReaders] = useState<string[]>([]);
  const [selectedReader, setSelectedReader] = useState<string>('');
  const [isLoadingReaders, setIsLoadingReaders] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  // Card state
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // PIN state
  const [pinInput, setPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [isPinVerifying, setIsPinVerifying] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null);

  // Action state
  const [isWriting, setIsWriting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [actionComplete, setActionComplete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Load readers on open ──────────────────────────────────────────

  const loadReaders = useCallback(async () => {
    setIsLoadingReaders(true);
    setReaderError(null);
    try {
      const r = await listReaders();
      setReaders(r);
      if (r.length === 1) {
        setSelectedReader(r[0]);
      }
    } catch (e: any) {
      setReaderError(e?.toString() || 'Failed to detect readers');
      setReaders([]);
    } finally {
      setIsLoadingReaders(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Reset reader selection so the useEffect on selectedReader re-fires
      // when loadReaders auto-selects, triggering a fresh card status read
      setSelectedReader('');
      loadReaders();
      // Reset state
      setCardStatus(null);
      setPinInput('');
      setNewPinInput('');
      setVerifiedPin(null);
      setShowPinSetup(false);
      setShowEraseConfirm(false);
      setShowOverwriteConfirm(false);
      setActionComplete(false);
      setActionError(null);
    }
  }, [open, loadReaders]);

  // ── Load card status when reader is selected ──────────────────────

  const loadCardStatus = useCallback(async (reader?: string, pinOverride?: string | null) => {
    const r = reader || selectedReader;
    if (!r) return;
    setIsLoadingStatus(true);
    setActionError(null);
    try {
      const pinToUse = pinOverride !== undefined ? pinOverride : verifiedPin;
      const status = await getCardStatus(r, pinToUse);
      setCardStatus(status);
    } catch (e: any) {
      setCardStatus(null);
      setActionError(e?.toString() || 'Failed to read card status');
    } finally {
      setIsLoadingStatus(false);
    }
  }, [selectedReader, verifiedPin]);

  useEffect(() => {
    if (selectedReader) {
      loadCardStatus(selectedReader);
    }
  }, [selectedReader]);

  // ── PIN verification ──────────────────────────────────────────────

  const handleVerifyPin = async () => {
    if (!pinInput || !selectedReader) return;
    setIsPinVerifying(true);
    setActionError(null);
    try {
      await verifyPin(selectedReader, pinInput);
      // Store verified PIN so subsequent commands can use it
      setVerifiedPin(pinInput);
      toast({ title: 'PIN Verified', description: 'Smart card unlocked successfully.' });
      // Reload status with the PIN so it shows as verified
      await loadCardStatus(undefined, pinInput);
      setPinInput('');
    } catch (e: any) {
      setActionError(e?.toString() || 'PIN verification failed');
    } finally {
      setIsPinVerifying(false);
    }
  };

  const handleSetPin = async () => {
    if (!newPinInput || !selectedReader) return;
    if (newPinInput.length < 8 || newPinInput.length > 16) {
      setActionError('PIN must be 8-16 characters.');
      return;
    }
    setActionError(null);
    try {
      await setPin(selectedReader, newPinInput);
      toast({ title: 'PIN Set', description: 'Your card is now PIN-protected.' });
      setNewPinInput('');
      setShowPinSetup(false);
      await loadCardStatus();
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to set PIN');
    }
  };

  // ── Write action ──────────────────────────────────────────────────

  const handleWrite = async () => {
    if (!selectedReader || !writeData) return;

    // Check for overwrite
    if (cardStatus?.has_data && !showOverwriteConfirm) {
      setShowOverwriteConfirm(true);
      return;
    }

    setIsWriting(true);
    setActionError(null);
    setShowOverwriteConfirm(false);

    try {
      if (mode === 'write-share') {
        await writeShareToCard(selectedReader, writeData, writeLabel, verifiedPin);
      } else if (mode === 'write-vault') {
        await writeVaultToCard(selectedReader, writeData, writeLabel, verifiedPin);
      }
      setActionComplete(true);
      const dataLabel = writeLabel || (mode === 'write-share' ? 'Share' : 'Vault');
      toast({
        title: 'Written to Smart Card!',
        description: `${dataLabel} saved to card successfully.`,
      });
    } catch (e: any) {
      setActionError(e?.toString() || 'Write failed');
    } finally {
      setIsWriting(false);
    }
  };

  // ── Read action ───────────────────────────────────────────────────

  const handleRead = async () => {
    if (!selectedReader) return;
    setIsReading(true);
    setActionError(null);

    try {
      const data = await readCard(selectedReader, verifiedPin);
      setActionComplete(true);
      toast({
        title: 'Read from Smart Card!',
        description: `${data.data_type === 'share' ? 'Share' : 'Vault'} loaded from card${data.label ? ` (${data.label})` : ''}.`,
      });
      onDataRead?.(data);
    } catch (e: any) {
      setActionError(e?.toString() || 'Read failed');
    } finally {
      setIsReading(false);
    }
  };

  // ── Erase action ──────────────────────────────────────────────────

  const handleErase = async () => {
    if (!selectedReader) return;
    if (!showEraseConfirm) {
      setShowEraseConfirm(true);
      return;
    }

    setIsErasing(true);
    setActionError(null);
    setShowEraseConfirm(false);

    try {
      await eraseCard(selectedReader, verifiedPin);
      toast({ title: 'Card Erased', description: 'All data and PIN have been removed from the card.' });
      setVerifiedPin(null);
      await loadCardStatus();
    } catch (e: any) {
      setActionError(e?.toString() || 'Erase failed');
    } finally {
      setIsErasing(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────

  const needsPinVerification = cardStatus?.pin_set && !cardStatus?.pin_verified && !verifiedPin;
  const isWriteMode = mode === 'write-share' || mode === 'write-vault';
  const isReadMode = mode === 'read';

  const writeTypeLabel = writeLabel || (mode === 'write-share' ? 'Share' : 'Vault');

  const title = isWriteMode
    ? `Write ${writeTypeLabel} to Smart Card`
    : 'Read from Smart Card';

  const description = isWriteMode
    ? `Save your ${writeLabel ? writeLabel.toLowerCase() : (mode === 'write-share' ? 'Shamir share' : 'encrypted vault')} to a JavaCard smartcard for secure physical backup.`
    : 'Load a share or vault from a JavaCard smartcard.';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isWriting && !isReading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── Reader Selection ── */}
          <div className="space-y-2">
            <Label>Smart Card Reader</Label>
            {isLoadingReaders ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Detecting readers...
              </div>
            ) : readerError ? (
              <div className="space-y-2">
                <Alert variant="destructive">
                  <AlertDescription>{readerError}</AlertDescription>
                </Alert>
                <Button variant="outline" size="sm" onClick={loadReaders}>
                  Retry Detection
                </Button>
              </div>
            ) : readers.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No readers found.</p>
                <Button variant="outline" size="sm" onClick={loadReaders}>
                  Retry Detection
                </Button>
              </div>
            ) : (
              <Select value={selectedReader} onValueChange={setSelectedReader}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reader..." />
                </SelectTrigger>
                <SelectContent>
                  {readers.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Card Status ── */}
          {isLoadingStatus && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading card...
            </div>
          )}

          {cardStatus && !isLoadingStatus && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Card Status</span>
                {cardStatus.pin_set && (
                  <span className="flex items-center gap-1 text-xs">
                    <Lock className="h-3 w-3" />
                    {cardStatus.pin_verified ? 'Unlocked' : 'Locked'}
                  </span>
                )}
              </div>
              {cardStatus.has_data ? (
                <div className="text-sm text-muted-foreground">
                  <span className="capitalize font-medium">{cardStatus.data_type}</span>
                  {' stored'}
                  {cardStatus.label && <> &mdash; <span className="font-medium">{cardStatus.label}</span></>}
                  {' '}({cardStatus.data_length} bytes)
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Card is empty — ready for data.</p>
              )}
            </div>
          )}

          {/* ── Different-data-type warning ── */}
          {isWriteMode && cardStatus && cardStatus.has_data && !actionComplete && (() => {
            const currentType = cardStatus.data_type; // "share" or "vault"
            const incomingType = mode === 'write-share' ? 'share' : 'vault';
            if (currentType !== incomingType) {
              return (
                <div className="flex items-start gap-2 rounded-lg border border-accent bg-accent/10 dark:bg-accent/5 p-3">
                  <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    This card currently stores <span className="font-medium capitalize">{currentType}</span> data
                    {cardStatus.label && <> (<span className="font-medium">{cardStatus.label}</span>)</>}.
                    Writing a <span className="font-medium">{writeTypeLabel.toLowerCase()}</span> will replace it.
                    Each card can hold one item — use a separate card to keep both.
                  </p>
                </div>
              );
            }
            return null;
          })()}

          {/* ── PIN Verification (if needed) ── */}
          {needsPinVerification && (
            <div className="rounded-lg border border-accent bg-accent/10 dark:bg-accent/5 p-3 space-y-2">
              <Label htmlFor="pin-verify" className="text-sm font-medium">Enter PIN to unlock card</Label>
              <div className="flex gap-2">
                <Input
                  id="pin-verify"
                  type="password"
                  placeholder="Enter PIN"
                  maxLength={16}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPin(); }}
                  disabled={isPinVerifying}
                  className="flex-1"
                />
                <Button
                  onClick={handleVerifyPin}
                  disabled={isPinVerifying || pinInput.length < 8}
                  size="sm"
                >
                  {isPinVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unlock'}
                </Button>
              </div>
            </div>
          )}

          {/* ── PIN Setup (optional, available in all modes) ── */}
          {cardStatus && !cardStatus.pin_set && !showPinSetup && !actionComplete && (
            <Button
              variant="outline"
              className="w-full border-accent text-foreground hover:bg-accent/20 dark:border-accent/50 dark:text-foreground dark:hover:bg-accent/10"
              onClick={() => setShowPinSetup(true)}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Set a PIN to protect this card (optional)
            </Button>
          )}

          {showPinSetup && (
            <div className="rounded-lg border border-accent bg-accent/10 dark:bg-accent/5 p-3 space-y-2">
              <Label htmlFor="pin-setup" className="text-sm font-medium">Set Card PIN (8-16 characters)</Label>
              <div className="flex gap-2">
                <Input
                  id="pin-setup"
                  type="password"
                  placeholder="8-16 characters"
                  maxLength={16}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleSetPin}
                  disabled={newPinInput.length < 8}
                  size="sm"
                  variant="outline"
                >
                  Set PIN
                </Button>
                <Button
                  onClick={() => { setShowPinSetup(false); setNewPinInput(''); }}
                  size="sm"
                  variant="ghost"
                >
                  Skip
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use a mix of upper/lowercase, numbers, and symbols. The card locks after 5 wrong attempts.
              </p>
            </div>
          )}

          {/* ── Overwrite Confirmation ── */}
          {showOverwriteConfirm && (
            <Alert className="border-accent bg-accent/10 dark:bg-accent/5">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertDescription>
                <span className="font-medium">Each card can only hold one item at a time.</span>
                {' '}This card already contains{' '}
                <span className="font-medium">{cardStatus?.data_type}</span> data
                {cardStatus?.label && <> (<span className="font-medium">{cardStatus.label}</span>)</>}.
                Writing your {writeTypeLabel.toLowerCase()} will replace it.
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="destructive" onClick={handleWrite}>
                    Yes, Overwrite
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowOverwriteConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* ── Erase Confirmation ── */}
          {showEraseConfirm && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will permanently erase all data AND remove the PIN from this card. Are you sure?
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="destructive" onClick={handleErase}>
                    Yes, Erase
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowEraseConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* ── Error Display ── */}
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {/* ── Success Display ── */}
          {actionComplete && (
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <CheckCircle2 className="h-5 w-5" />
              {isWriteMode ? 'Data written to card successfully!' : 'Data read from card successfully!'}
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          {/* Write button */}
          {isWriteMode && !actionComplete && !showOverwriteConfirm && (
            <Button
              onClick={handleWrite}
              disabled={
                isWriting ||
                !selectedReader ||
                !cardStatus ||
                !!needsPinVerification
              }
              className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
            >
              {isWriting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Writing...</>
              ) : (
                <><CreditCard className="mr-2 h-4 w-4" /> Write to Card</>
              )}
            </Button>
          )}

          {/* Read button */}
          {isReadMode && !actionComplete && (
            <Button
              onClick={handleRead}
              disabled={
                isReading ||
                !selectedReader ||
                !cardStatus ||
                !cardStatus.has_data ||
                !!needsPinVerification
              }
              className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
            >
              {isReading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading...</>
              ) : (
                <><CreditCard className="mr-2 h-4 w-4" /> Read from Card</>
              )}
            </Button>
          )}

          {/* Erase button (always available when card has data) */}
          {cardStatus?.has_data && !actionComplete && !showEraseConfirm && !showOverwriteConfirm && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleErase}
              disabled={isErasing || !!needsPinVerification}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Erase Card
            </Button>
          )}

          {/* Done button (after success) */}
          {actionComplete && (
            <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
