/**
 * SmartCardDialog — Shared dialog for reading/writing to JavaCard smartcards.
 *
 * Supports multi-item storage: multiple items (shares, vaults, instructions)
 * can be stored on a single card. New writes append to existing data.
 *
 * Modes:
 *  - "write-share": Write a single Shamir share to a card
 *  - "write-vault": Write a full vault or instructions to a card
 *  - "read":        Read a share or vault from a card (user picks from list)
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, ShieldCheck, AlertTriangle, Trash2, CheckCircle2, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  listReaders,
  getCardStatus,
  writeItemToCard,
  readCardItem,
  eraseCard,
  verifyPin,
  setPin,
  CardStatus,
  CardItem,
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
  /** The type of item being written (e.g. "share", "vault", "instructions"). */
  writeItemType?: string;
  /** Callback when data is successfully read from the card. */
  onDataRead?: (data: CardItem) => void;
}

export function SmartCardDialog({
  open,
  onOpenChange,
  mode,
  writeData,
  writeLabel = '',
  writeItemType,
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
  const [actionComplete, setActionComplete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Read mode: item selection
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

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
      setActionComplete(false);
      setActionError(null);
      setSelectedItemIndex(null);
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
      // Auto-select if only 1 item in read mode
      if (mode === 'read' && status.total_items === 1) {
        setSelectedItemIndex(0);
      }
    } catch (e: any) {
      setCardStatus(null);
      setActionError(e?.toString() || 'Failed to read card status');
    } finally {
      setIsLoadingStatus(false);
    }
  }, [selectedReader, verifiedPin, mode]);

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

    setIsWriting(true);
    setActionError(null);

    try {
      const itemType = writeItemType || (mode === 'write-share' ? 'share' : 'vault');
      await writeItemToCard(selectedReader, itemType, writeData, writeLabel, verifiedPin);
      setActionComplete(true);
      const dataLabel = writeLabel || (mode === 'write-share' ? 'Share' : 'Vault');
      toast({
        title: 'Written to Smart Card!',
        description: `${dataLabel} added to card successfully.`,
      });
    } catch (e: any) {
      setActionError(e?.toString() || 'Write failed');
    } finally {
      setIsWriting(false);
    }
  };

  // ── Read action ───────────────────────────────────────────────────

  const handleRead = async () => {
    if (!selectedReader || selectedItemIndex === null) return;
    setIsReading(true);
    setActionError(null);

    try {
      const item = await readCardItem(selectedReader, selectedItemIndex, verifiedPin);
      setActionComplete(true);
      toast({
        title: 'Read from Smart Card!',
        description: `${item.item_type === 'share' ? 'Share' : item.item_type === 'vault' ? 'Vault' : 'Item'} loaded from card${item.label ? ` (${item.label})` : ''}.`,
      });
      onDataRead?.(item);
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

  // Estimate whether the new item will fit
  const newItemJsonOverhead = 80;
  const newItemSize = (writeData?.length || 0) + (writeLabel?.length || 0) + newItemJsonOverhead;
  const willFit = !cardStatus || cardStatus.free_bytes_estimate >= newItemSize;

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
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
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
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {cardStatus.total_items} item{cardStatus.total_items !== 1 ? 's' : ''} stored
                    {' '}({cardStatus.data_length} bytes used, ~{Math.max(0, cardStatus.free_bytes_estimate)} bytes free)
                  </p>
                  {cardStatus.items.map((item) => (
                    <div key={item.index} className="text-xs text-muted-foreground pl-2 border-l-2 border-accent/30">
                      <span className="capitalize font-medium">{item.item_type}</span>
                      {item.label && <> &mdash; {item.label}</>}
                      <span className="ml-1">({item.data_size}B)</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Card is empty — ready for data.</p>
              )}
            </div>
          )}

          {/* ── Capacity warning ── */}
          {isWriteMode && cardStatus && !willFit && !actionComplete && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                This item (~{newItemSize.toLocaleString()} bytes) may not fit on the card
                (~{Math.max(0, cardStatus.free_bytes_estimate).toLocaleString()} bytes free).
                Consider removing existing items first.
              </p>
            </div>
          )}

          {/* ── Item selection for read mode ── */}
          {isReadMode && cardStatus?.items && cardStatus.items.length > 0 && !actionComplete && !needsPinVerification && (
            <div className="space-y-2">
              <Label>Select an item to import</Label>
              <div className="rounded-md border p-1 max-h-48 overflow-y-auto space-y-0.5">
                {cardStatus.items.map((item) => (
                  <button
                    key={item.index}
                    onClick={() => setSelectedItemIndex(item.index)}
                    className={cn(
                      'w-full text-left text-sm flex items-center justify-between p-2 rounded-md transition-colors',
                      'hover:bg-muted/50',
                      selectedItemIndex === item.index && 'bg-accent/20 border border-accent'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="capitalize font-medium">{item.item_type}</span>
                      {item.label && <span className="text-muted-foreground truncate max-w-[200px]">&mdash; {item.label}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{item.data_size}B</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
          {isWriteMode && !actionComplete && (
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
                selectedItemIndex === null ||
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
          {cardStatus?.has_data && !actionComplete && !showEraseConfirm && (
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
