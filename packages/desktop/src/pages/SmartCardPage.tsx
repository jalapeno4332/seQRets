/**
 * SmartCardPage — Standalone Smart Card management page.
 *
 * Provides two key management functions:
 *  - Set / Change PIN
 *  - Erase Card (factory reset — clears data + PIN)
 *
 * Accessible from the app menu via /smartcard route.
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Lock,
  LockOpen,
  CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/header';
import { useTheme } from '@/components/theme-provider';
import logoLight from '@/assets/icons/logo-light.png';
import logoDark from '@/assets/icons/logo-dark.png';
import { useToast } from '@/hooks/use-toast';
import {
  listReaders,
  getCardStatus,
  verifyPin,
  setPin,
  changePin,
  eraseCard,
  deleteCardItem,
  CardStatus,
} from '@/lib/smartcard';

export default function SmartCardPage() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const appIcon = isDark ? logoDark : logoLight;

  // ── Reader state ─────────────────────────────────────────────────
  const [readers, setReaders] = useState<string[]>([]);
  const [selectedReader, setSelectedReader] = useState<string>('');
  const [isLoadingReaders, setIsLoadingReaders] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  // ── Card state ───────────────────────────────────────────────────
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // ── PIN verification state ───────────────────────────────────────
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null);
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  // ── Set PIN state ────────────────────────────────────────────────
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);

  // ── Change PIN state ─────────────────────────────────────────────
  const [oldPinInput, setOldPinInput] = useState('');
  const [changePinInput, setChangePinInput] = useState('');
  const [confirmChangePinInput, setConfirmChangePinInput] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // ── Erase state ──────────────────────────────────────────────────
  const [isErasing, setIsErasing] = useState(false);

  // ── Delete item state ──────────────────────────────────────────
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [deletingItemIndex, setDeletingItemIndex] = useState<number | null>(null);

  // ── General state ────────────────────────────────────────────────
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Load readers on mount ────────────────────────────────────────

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
    loadReaders();
  }, [loadReaders]);

  // ── Load card status when reader changes ─────────────────────────

  const loadCardStatus = useCallback(
    async (reader?: string, pinOverride?: string | null) => {
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
    },
    [selectedReader, verifiedPin],
  );

  useEffect(() => {
    if (selectedReader) {
      // Reset state when reader changes
      setVerifiedPin(null);
      setUnlockPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setOldPinInput('');
      setChangePinInput('');
      setConfirmChangePinInput('');
      setActionError(null);
      loadCardStatus(selectedReader, null);
    }
  }, [selectedReader]);

  // ── PIN unlock (for erase on PIN-protected cards) ────────────────

  const handleUnlockPin = async () => {
    if (!unlockPinInput || !selectedReader) return;
    setIsUnlocking(true);
    setActionError(null);
    try {
      await verifyPin(selectedReader, unlockPinInput);
      setVerifiedPin(unlockPinInput);
      toast({ title: 'PIN Verified', description: 'Smart card unlocked successfully.' });
      await loadCardStatus(undefined, unlockPinInput);
      setUnlockPinInput('');
    } catch (e: any) {
      setActionError(e?.toString() || 'PIN verification failed');
    } finally {
      setIsUnlocking(false);
    }
  };

  // ── Set PIN (initial setup) ──────────────────────────────────────

  const handleSetPin = async () => {
    if (!newPinInput || !selectedReader) return;
    if (newPinInput.length < 8 || newPinInput.length > 16) {
      setActionError('PIN must be 8-16 characters.');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setActionError('PINs do not match.');
      return;
    }
    setIsSettingPin(true);
    setActionError(null);
    try {
      await setPin(selectedReader, newPinInput);
      setVerifiedPin(newPinInput);
      toast({ title: 'PIN Set', description: 'Your card is now PIN-protected.' });
      setNewPinInput('');
      setConfirmPinInput('');
      await loadCardStatus(undefined, newPinInput);
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to set PIN');
    } finally {
      setIsSettingPin(false);
    }
  };

  // ── Change PIN ───────────────────────────────────────────────────

  const handleChangePin = async () => {
    if (!oldPinInput || !changePinInput || !selectedReader) return;
    if (changePinInput.length < 8 || changePinInput.length > 16) {
      setActionError('New PIN must be 8-16 characters.');
      return;
    }
    if (changePinInput !== confirmChangePinInput) {
      setActionError('New PINs do not match.');
      return;
    }
    setIsChangingPin(true);
    setActionError(null);
    try {
      await changePin(selectedReader, oldPinInput, changePinInput);
      setVerifiedPin(changePinInput);
      toast({ title: 'PIN Changed', description: 'Your card PIN has been updated.' });
      setOldPinInput('');
      setChangePinInput('');
      setConfirmChangePinInput('');
      await loadCardStatus(undefined, changePinInput);
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to change PIN. Check your current PIN.');
    } finally {
      setIsChangingPin(false);
    }
  };

  // ── Erase card (factory reset) ──────────────────────────────────

  const handleErase = async () => {
    if (!selectedReader) return;
    setIsErasing(true);
    setActionError(null);
    try {
      await eraseCard(selectedReader, verifiedPin);
      toast({
        title: 'Card Erased',
        description: 'All data and PIN have been removed from the card.',
      });
      setVerifiedPin(null);
      setUnlockPinInput('');
      await loadCardStatus(selectedReader, null);
    } catch (e: any) {
      setActionError(e?.toString() || 'Erase failed');
    } finally {
      setIsErasing(false);
    }
  };

  // ── Delete single item ──────────────────────────────────────────

  const handleDeleteItem = async (index: number) => {
    if (!selectedReader) return;
    setIsDeletingItem(true);
    setDeletingItemIndex(index);
    setActionError(null);
    try {
      await deleteCardItem(selectedReader, index, verifiedPin);
      toast({
        title: 'Item Deleted',
        description: 'The item has been removed from the card.',
      });
      await loadCardStatus();
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to delete item');
    } finally {
      setIsDeletingItem(false);
      setDeletingItemIndex(null);
    }
  };

  // ── Derived state ────────────────────────────────────────────────

  const needsPinUnlock = cardStatus?.pin_set && !cardStatus?.pin_verified && !verifiedPin;
  const setPinValid = newPinInput.length >= 8 && newPinInput.length <= 16 && newPinInput === confirmPinInput;
  const changePinValid =
    oldPinInput.length >= 8 &&
    changePinInput.length >= 8 &&
    changePinInput.length <= 16 &&
    changePinInput === confirmChangePinInput;

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
      <div className="w-full max-w-4xl mx-auto relative">
        <div className="absolute top-4 left-4 z-50">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to App
            </Link>
          </Button>
        </div>
        <Header />

        <header className="text-center mb-6 pt-16 sm:pt-0">
          <div className="flex justify-center items-center gap-2.5">
            <img src={appIcon} alt="seQRets Logo" width={144} height={144} className="self-start -mt-2" />
            <div>
              <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
                seQRets
              </h1>
              <p className="text-right text-base font-bold text-foreground tracking-wide">
                Secure. Split. Share.
              </p>
            </div>
          </div>
        </header>

        {/* ── Page Title ── */}
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-3 mb-4">
            <CreditCard className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Smart Card Manager</h1>
          </div>
          <p className="text-muted-foreground">
            Manage PIN protection and perform factory reset on your JavaCard smartcards.
          </p>
        </div>

        <div className="space-y-6">
          {/* ═══════════════════════════════════════════════════════════════
              A. Reader Selection
              ═══════════════════════════════════════════════════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Smart Card Reader
              </CardTitle>
              <CardDescription>
                Insert your JavaCard into a reader and select it below.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Retry Detection
                  </Button>
                </div>
              ) : readers.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No readers found. Connect a smart card reader and try again.
                  </p>
                  <Button variant="outline" size="sm" onClick={loadReaders}>
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Retry Detection
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={selectedReader} onValueChange={setSelectedReader}>
                    <SelectTrigger className="flex-1">
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
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      loadReaders();
                      if (selectedReader) loadCardStatus();
                    }}
                    title="Refresh"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══════════════════════════════════════════════════════════════
              B. Card Status
              ═══════════════════════════════════════════════════════════ */}
          {selectedReader && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Card Status</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingStatus ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading card...
                  </div>
                ) : cardStatus ? (
                  <div className="space-y-3">
                    {/* PIN Status */}
                    <div className="flex items-center gap-2">
                      {cardStatus.pin_set ? (
                        cardStatus.pin_verified || verifiedPin ? (
                          <>
                            <LockOpen className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-600">PIN Protected — Unlocked</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium text-primary">PIN Protected — Locked</span>
                          </>
                        )
                      ) : (
                        <>
                          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">No PIN — Card is unprotected</span>
                        </>
                      )}
                    </div>

                    {/* Data Status */}
                    <div className="text-sm text-muted-foreground">
                      {cardStatus.has_data ? (
                        <div className="space-y-2">
                          <p>
                            {cardStatus.total_items} item{cardStatus.total_items !== 1 ? 's' : ''} stored
                            {' '}({cardStatus.data_length} bytes used, ~{Math.max(0, cardStatus.free_bytes_estimate)} bytes free)
                          </p>
                          <div className="space-y-1">
                            {cardStatus.items.map((item) => (
                              <div
                                key={item.index}
                                className="flex items-center justify-between p-2 rounded-md border bg-card text-sm"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="capitalize font-medium">{item.item_type}</span>
                                  {item.label && (
                                    <span className="text-muted-foreground truncate">&mdash; {item.label}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground shrink-0">({item.data_size}B)</span>
                                </div>
                                {!needsPinUnlock && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                                        disabled={isDeletingItem}
                                      >
                                        {isDeletingItem && deletingItemIndex === item.index ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Item?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Remove &ldquo;{item.label || item.item_type}&rdquo; from this card?
                                          Other items will be preserved.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeleteItem(item.index)}
                                          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        'Card is empty — no data stored.'
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadCardStatus()}
                      disabled={isLoadingStatus}
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Refresh Status
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No card detected. Insert a JavaCard and refresh.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              PIN Unlock (if card is locked)
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && needsPinUnlock && (
            <Card className="border-accent dark:border-accent/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  Unlock Card
                </CardTitle>
                <CardDescription>
                  This card is PIN-protected. Enter your PIN to unlock it for management.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Enter PIN"
                    maxLength={16}
                    value={unlockPinInput}
                    onChange={(e) => setUnlockPinInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUnlockPin();
                    }}
                    disabled={isUnlocking}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleUnlockPin}
                    disabled={isUnlocking || unlockPinInput.length < 8}
                  >
                    {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unlock'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              C. PIN Management
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && !needsPinUnlock && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  {cardStatus.pin_set ? 'Change PIN' : 'Set PIN'}
                </CardTitle>
                <CardDescription>
                  {cardStatus.pin_set
                    ? 'Change the PIN on this card. You will need your current PIN.'
                    : 'Protect this card with a PIN. Anyone with the card will need the PIN to read or modify data.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Warning */}
                <Alert className="border-accent bg-accent/10 dark:bg-accent/5">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm">
                    <strong>Important:</strong> The card locks permanently after 5 wrong PIN attempts.
                    Your PIN cannot be recovered if forgotten — you will need to factory reset the card,
                    which erases all data.
                  </AlertDescription>
                </Alert>

                {cardStatus.pin_set ? (
                  /* ── Change PIN Form ── */
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="old-pin">Current PIN</Label>
                      <Input
                        id="old-pin"
                        type="password"
                        placeholder="Enter current PIN"
                        maxLength={16}
                        value={oldPinInput}
                        onChange={(e) => setOldPinInput(e.target.value)}
                        disabled={isChangingPin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pin-change">New PIN (8-16 characters)</Label>
                      <Input
                        id="new-pin-change"
                        type="password"
                        placeholder="Enter new PIN"
                        maxLength={16}
                        value={changePinInput}
                        onChange={(e) => setChangePinInput(e.target.value)}
                        disabled={isChangingPin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pin-change">Confirm New PIN</Label>
                      <Input
                        id="confirm-pin-change"
                        type="password"
                        placeholder="Re-enter new PIN"
                        maxLength={16}
                        value={confirmChangePinInput}
                        onChange={(e) => setConfirmChangePinInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && changePinValid) handleChangePin();
                        }}
                        disabled={isChangingPin}
                      />
                      {confirmChangePinInput && changePinInput !== confirmChangePinInput && (
                        <p className="text-xs text-destructive">PINs do not match.</p>
                      )}
                    </div>
                    <Button
                      onClick={handleChangePin}
                      disabled={!changePinValid || isChangingPin}
                      className="w-full sm:w-auto"
                    >
                      {isChangingPin ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Changing PIN...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Change PIN
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  /* ── Set PIN Form ── */
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pin">New PIN (8-16 characters)</Label>
                      <Input
                        id="new-pin"
                        type="password"
                        placeholder="Enter PIN"
                        maxLength={16}
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        disabled={isSettingPin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pin">Confirm PIN</Label>
                      <Input
                        id="confirm-pin"
                        type="password"
                        placeholder="Re-enter PIN"
                        maxLength={16}
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && setPinValid) handleSetPin();
                        }}
                        disabled={isSettingPin}
                      />
                      {confirmPinInput && newPinInput !== confirmPinInput && (
                        <p className="text-xs text-destructive">PINs do not match.</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use a mix of upper/lowercase letters, numbers, and symbols for a strong PIN.
                    </p>
                    <Button
                      onClick={handleSetPin}
                      disabled={!setPinValid || isSettingPin}
                      className="w-full sm:w-auto"
                    >
                      {isSettingPin ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Setting PIN...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Set PIN
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              D. Erase / Factory Reset
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && !needsPinUnlock && (
            <Card className="border-destructive/30 dark:border-destructive/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Factory Reset
                </CardTitle>
                <CardDescription>
                  Completely erase this card — removes all stored data AND the PIN.
                  The card will be returned to a blank, unprotected state.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show what will be destroyed */}
                {(cardStatus.has_data || cardStatus.pin_set) && (
                  <div className="rounded-lg border border-destructive/30 dark:border-destructive/40 bg-destructive/5 dark:bg-destructive/10 p-3 text-sm space-y-1">
                    <p className="font-medium text-destructive">
                      The following will be permanently destroyed:
                    </p>
                    <ul className="list-disc list-inside text-destructive space-y-0.5">
                      {cardStatus.has_data && cardStatus.items.map((item) => (
                        <li key={item.index}>
                          <span className="capitalize">{item.item_type}</span>
                          {item.label && <> ({item.label})</>}
                          {' '}&mdash; {item.data_size} bytes
                        </li>
                      ))}
                      {cardStatus.pin_set && <li>PIN protection</li>}
                    </ul>
                  </div>
                )}

                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This will permanently destroy ALL data AND remove the PIN. This action cannot be undone.
                  </AlertDescription>
                </Alert>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={isErasing}
                      className="w-full sm:w-auto"
                    >
                      {isErasing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Erasing...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Erase Card
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Factory Reset Card?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently erase ALL data and remove the PIN from this card.
                        The card will be returned to a blank, unprotected state.
                        <br />
                        <br />
                        <strong>This action cannot be undone.</strong>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleErase}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        Yes, Erase Everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}

          {/* ── Error Display ── */}
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </main>
  );
}
