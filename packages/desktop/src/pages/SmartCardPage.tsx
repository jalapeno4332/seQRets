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
import { copyWithAutoClear } from '@/lib/clipboard-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Dices,
  Eye,
  EyeOff,
  Copy,
  CopyCheck,
  Key,
  ShieldOff,
  Shield,
  Settings,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/header';
import { useTheme } from '@/components/theme-provider';
import logoLight from '@/assets/icons/logo-light.webp';
import logoDark from '@/assets/icons/logo-dark.webp';
import { useToast } from '@/hooks/use-toast';
import { KeyfileUpload } from '@/components/keyfile-upload';
import { SmartCardDialog } from '@/components/smartcard-dialog';
import { AppFooter } from '@/components/app-footer';
import {
  listReaders,
  getCardStatus,
  verifyPin,
  setPin,
  changePin,
  eraseCard,
  forceEraseCard,
  setWipeProtect,
  deleteCardItem,
  readCardItems,
  writeAllItems,
  CardStatus,
  CardItem,
} from '@/lib/smartcard';

/**
 * Smart-card PINs are stored as raw bytes on the card, which enforces an
 * 8-16 *byte* length. Restrict input to printable ASCII so one typed
 * character is always one byte — keeping the UI's character count in step
 * with the card and preventing multi-byte input from being silently rejected.
 */
const asciiOnly = (v: string) => v.replace(/[^\x20-\x7E]/g, '');

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
  // Wipe protection is enabled alongside the PIN by default: an unprotected
  // card can be factory-reset by anyone holding it, which silently turns a
  // 2-of-3 set into a 2-of-2. Opt-out lives next to the PIN fields.
  const [protectOnSetPin, setProtectOnSetPin] = useState(true);
  const [newPinVisible, setNewPinVisible] = useState(false);

  // ── Change PIN state ─────────────────────────────────────────────
  const [oldPinInput, setOldPinInput] = useState('');
  const [changePinInput, setChangePinInput] = useState('');
  const [confirmChangePinInput, setConfirmChangePinInput] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [changePinVisible, setChangePinVisible] = useState(false);

  // ── Wipe protection state ────────────────────────────────────────
  const [isTogglingWipeProtect, setIsTogglingWipeProtect] = useState(false);

  // ── Erase state ──────────────────────────────────────────────────
  const [isErasing, setIsErasing] = useState(false);

  // ── Delete item state ──────────────────────────────────────────
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [deletingItemIndex, setDeletingItemIndex] = useState<number | null>(null);

  // ── Keyfile write state ─────────────────────────────────────────
  const [keyfileData, setKeyfileData] = useState<string | null>(null);
  const [keyfileName, setKeyfileName] = useState<string | null>(null);
  const [showKeyfileSmartCard, setShowKeyfileSmartCard] = useState(false);

  // ── Clone card state ───────────────────────────────────────────
  const [cloneStep, setCloneStep] = useState<'idle' | 'reading' | 'ready' | 'writing'>('idle');
  const [clonedItems, setClonedItems] = useState<CardItem[]>([]);
  const [cloneDestReader, setCloneDestReader] = useState<string>('');
  const [cloneDestPin, setCloneDestPin] = useState('');

  // ── Tab state ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>('status');

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
      setNewPinVisible(false);
      setOldPinInput('');
      setChangePinInput('');
      setConfirmChangePinInput('');
      setChangePinVisible(false);
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
      // Reload card status to get updated pin_retries_remaining from the card
      try {
        await loadCardStatus(selectedReader, null);
      } catch {
        // Ignore — status reload is best-effort
      }
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

      // Wipe protection can only be turned on once a PIN exists, so this is
      // the moment to do it. If it fails the PIN is still set — say so rather
      // than reporting a blanket failure, or the user re-runs Set PIN against
      // a card that already has one.
      let protectionOn = false;
      if (protectOnSetPin) {
        try {
          await setWipeProtect(selectedReader, newPinInput, true);
          protectionOn = true;
        } catch (e: any) {
          setActionError(
            `Your PIN was set, but wipe protection could not be enabled: ${e?.toString() ?? 'unknown error'}. `
            + 'You can enable it below.',
          );
        }
      }

      toast({
        title: 'PIN Set',
        description: protectionOn
          ? 'Your card is PIN-protected. The PIN is now required to erase it.'
          : 'Your card is now PIN-protected. It can still be erased without the PIN.',
      });
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

  // ── Toggle wipe protection ─────────────────────────────────────

  const handleToggleWipeProtect = async () => {
    if (!selectedReader || !verifiedPin || !cardStatus) return;
    const newValue = !cardStatus.wipe_protected;
    setIsTogglingWipeProtect(true);
    setActionError(null);
    try {
      await setWipeProtect(selectedReader, verifiedPin, newValue);
      toast({
        title: newValue ? 'Wipe Protection Enabled' : 'Wipe Protection Disabled',
        description: newValue
          ? 'PIN is now required to erase this card.'
          : 'Card can now be factory-reset without PIN verification.',
      });
      await loadCardStatus();
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to toggle wipe protection');
    } finally {
      setIsTogglingWipeProtect(false);
    }
  };

  // ── Erase card (factory reset) ──────────────────────────────────

  const handleErase = async () => {
    if (!selectedReader) return;
    setIsErasing(true);
    setActionError(null);
    try {
      // Block force-erase when wipe protection is enabled
      if (needsPinUnlock && cardStatus?.wipe_protected) {
        setActionError(
          'This card has wipe protection enabled. You must unlock it with your PIN before erasing. ' +
          'If the card is permanently locked (0 retries remaining), the data is unrecoverable by design.'
        );
        setIsErasing(false);
        return;
      }
      // Use force erase when PIN is locked (retries exhausted) or unverified
      if (needsPinUnlock) {
        await forceEraseCard(selectedReader);
      } else {
        await eraseCard(selectedReader, verifiedPin);
      }
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

  // ── Clone card handlers ─────────────────────────────────────────

  const handleCloneRead = async () => {
    if (!selectedReader) return;
    setCloneStep('reading');
    setActionError(null);
    try {
      const items = await readCardItems(selectedReader, verifiedPin);
      setClonedItems(items);
      setCloneStep('ready');
      toast({ title: 'Source Card Read', description: `${items.length} item${items.length !== 1 ? 's' : ''} ready to clone.` });
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to read source card');
      setCloneStep('idle');
    }
  };

  const handleCloneWrite = async () => {
    const destReader = readers.length > 1 ? cloneDestReader : selectedReader;
    if (!destReader || clonedItems.length === 0) return;
    setCloneStep('writing');
    setActionError(null);
    try {
      await writeAllItems(destReader, clonedItems, cloneDestPin || null);
      toast({ title: 'Card Cloned', description: `${clonedItems.length} item${clonedItems.length !== 1 ? 's' : ''} written to destination card.` });
      setCloneStep('idle');
      setClonedItems([]);
      setCloneDestPin('');
      await loadCardStatus();
    } catch (e: any) {
      setActionError(e?.toString() || 'Failed to write to destination card');
      setCloneStep('ready');
    }
  };

  const handleCloneReset = () => {
    setCloneStep('idle');
    setClonedItems([]);
    setCloneDestPin('');
    setActionError(null);
  };

  // ── Derived state ────────────────────────────────────────────────

  const needsPinUnlock = cardStatus?.pin_set && !cardStatus?.pin_verified && !verifiedPin;
  const setPinValid = newPinInput.length >= 8 && newPinInput.length <= 16 && newPinInput === confirmPinInput;
  const changePinValid =
    oldPinInput.length >= 8 &&
    changePinInput.length >= 8 &&
    changePinInput.length <= 16 &&
    changePinInput === confirmChangePinInput;

  // ── Generate cryptographically secure PIN ──────────────────────────
  const generatePin = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const length = 16;
    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);
    let pin = '';
    for (let i = 0; i < length; i++) {
      pin += charset[randomValues[i] % charset.length];
    }
    return pin;
  };

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
              Tabbed sections
              ═══════════════════════════════════════════════════════════ */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-3 h-12 mb-6">
              <TabsTrigger value="status" className="gap-2">
                <CreditCard className="h-4 w-4" /> Status
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Shield className="h-4 w-4" /> Security
              </TabsTrigger>
              <TabsTrigger value="advanced" className="gap-2">
                <Settings className="h-4 w-4" /> Advanced
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Status ── */}
            <TabsContent value="status" className="space-y-6">

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
                    <div className="flex items-center gap-2 flex-wrap">
                      {cardStatus.pin_set ? (
                        cardStatus.pin_verified || verifiedPin ? (
                          <>
                            <LockOpen className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-600">PIN Protected — Unlocked</span>
                          </>
                        ) : cardStatus.pin_retries_remaining === 0 ? (
                          <>
                            <ShieldAlert className="h-4 w-4 text-destructive" />
                            <span className="text-sm font-bold text-destructive">Card Permanently Locked — Factory Reset Required</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium text-primary">PIN Protected — Locked</span>
                            {cardStatus.pin_retries_remaining < 5 && (
                              <span className={`text-xs font-medium ${cardStatus.pin_retries_remaining <= 1 ? 'text-destructive' : cardStatus.pin_retries_remaining <= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                ({cardStatus.pin_retries_remaining} attempt{cardStatus.pin_retries_remaining !== 1 ? 's' : ''} left)
                              </span>
                            )}
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
                            {' '}({cardStatus.data_length} of {cardStatus.card_capacity} bytes used, {Math.max(0, cardStatus.free_bytes_estimate)} bytes free)
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
              C. Write Keyfile to Card
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && !needsPinUnlock && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Write Keyfile to Card
                </CardTitle>
                <CardDescription>
                  Store a keyfile (.bin) on this smart card for secure physical backup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <KeyfileUpload
                  onFileRead={setKeyfileData}
                  onFileNameChange={setKeyfileName}
                  fileName={keyfileName}
                />
                <Button
                  onClick={() => setShowKeyfileSmartCard(true)}
                  disabled={!keyfileData}
                  className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/80 hover:shadow-md"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Write to Card
                </Button>
              </CardContent>
            </Card>
          )}

            </TabsContent>

            {/* ── Tab 2: Security ── */}
            <TabsContent value="security" className="space-y-6">

          {/* ═══════════════════════════════════════════════════════════════
              PIN Unlock (if card is locked)
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && needsPinUnlock && (
            cardStatus.pin_retries_remaining === 0 ? (
              <Card className="border-destructive dark:border-destructive/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-5 w-5" />
                    Card Permanently Locked
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      All 5 PIN attempts have been exhausted. This card is permanently locked and cannot be unlocked.
                    </AlertDescription>
                  </Alert>
                  <p className="text-sm text-muted-foreground">
                    To use this card again, you must perform a <strong>Factory Reset</strong> in the Advanced tab. This will erase ALL data on the card and remove the PIN, returning it to a blank state.
                  </p>
                </CardContent>
              </Card>
            ) : (
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
                      aria-label="Card PIN"
                      placeholder="Enter PIN"
                      maxLength={16}
                      value={unlockPinInput}
                      onChange={(e) => setUnlockPinInput(asciiOnly(e.target.value))}
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
                  {cardStatus.pin_retries_remaining < 5 && (
                    <p className={`text-sm font-medium mt-2 ${cardStatus.pin_retries_remaining <= 1 ? 'text-destructive' : cardStatus.pin_retries_remaining <= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      ⚠ {cardStatus.pin_retries_remaining} attempt{cardStatus.pin_retries_remaining !== 1 ? 's' : ''} remaining before the card locks permanently.
                    </p>
                  )}
                </CardContent>
              </Card>
            )
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
                        onChange={(e) => setOldPinInput(asciiOnly(e.target.value))}
                        disabled={isChangingPin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pin-change">New PIN (8-16 characters)</Label>
                      <div className="relative">
                        <Input
                          id="new-pin-change"
                          type={changePinVisible ? 'text' : 'password'}
                          placeholder="Enter new PIN"
                          maxLength={16}
                          value={changePinInput}
                          onChange={(e) => setChangePinInput(asciiOnly(e.target.value))}
                          disabled={isChangingPin}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setChangePinVisible(!changePinVisible)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
                          aria-label={changePinVisible ? 'Hide PIN' : 'Show PIN'}
                        >
                          {changePinVisible ? <EyeOff /> : <Eye />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pin-change">Confirm New PIN</Label>
                      <div className="relative">
                        <Input
                          id="confirm-pin-change"
                          type={changePinVisible ? 'text' : 'password'}
                          placeholder="Re-enter new PIN"
                          maxLength={16}
                          value={confirmChangePinInput}
                          onChange={(e) => setConfirmChangePinInput(asciiOnly(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && changePinValid) handleChangePin();
                          }}
                          disabled={isChangingPin}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setChangePinVisible(!changePinVisible)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
                          aria-label={changePinVisible ? 'Hide PIN' : 'Show PIN'}
                        >
                          {changePinVisible ? <EyeOff /> : <Eye />}
                        </button>
                      </div>
                      {confirmChangePinInput && changePinInput !== confirmChangePinInput && (
                        <p className="text-xs text-destructive">PINs do not match.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (changePinInput) {
                            copyWithAutoClear(changePinInput);
                            toast({ title: 'Copied to clipboard!', description: 'Your PIN has been copied. Clipboard clears in 60s.' });
                          }
                        }}
                        disabled={!changePinInput}
                        aria-label="Copy PIN"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const pin = generatePin();
                          setChangePinInput(pin);
                          setConfirmChangePinInput(pin);
                          copyWithAutoClear(pin);
                          toast({ title: 'PIN Generated & Copied', description: 'A secure 16-character PIN has been generated and copied to your clipboard. Clipboard clears in 60s. Save it somewhere safe!' });
                        }}
                        disabled={isChangingPin}
                      >
                        <Dices className="mr-2 h-4 w-4" />
                        Generate PIN
                      </Button>
                      <Button
                        onClick={handleChangePin}
                        disabled={!changePinValid || isChangingPin}
                        className="ml-auto"
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
                  </div>
                ) : (
                  /* ── Set PIN Form ── */
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pin">New PIN (8-16 characters)</Label>
                      <div className="relative">
                        <Input
                          id="new-pin"
                          type={newPinVisible ? 'text' : 'password'}
                          placeholder="Enter PIN"
                          maxLength={16}
                          value={newPinInput}
                          onChange={(e) => setNewPinInput(asciiOnly(e.target.value))}
                          disabled={isSettingPin}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setNewPinVisible(!newPinVisible)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
                          aria-label={newPinVisible ? 'Hide PIN' : 'Show PIN'}
                        >
                          {newPinVisible ? <EyeOff /> : <Eye />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pin">Confirm PIN</Label>
                      <div className="relative">
                        <Input
                          id="confirm-pin"
                          type={newPinVisible ? 'text' : 'password'}
                          placeholder="Re-enter PIN"
                          maxLength={16}
                          value={confirmPinInput}
                          onChange={(e) => setConfirmPinInput(asciiOnly(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && setPinValid) handleSetPin();
                          }}
                          disabled={isSettingPin}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setNewPinVisible(!newPinVisible)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
                          aria-label={newPinVisible ? 'Hide PIN' : 'Show PIN'}
                        >
                          {newPinVisible ? <EyeOff /> : <Eye />}
                        </button>
                      </div>
                      {confirmPinInput && newPinInput !== confirmPinInput && (
                        <p className="text-xs text-destructive">PINs do not match.</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use a mix of upper/lowercase letters, numbers, and symbols for a strong PIN.
                    </p>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <Label htmlFor="protect-on-set-pin" className="text-sm font-medium leading-snug">
                          Require this PIN to erase the card
                          <span className="ml-2 text-xs font-normal text-muted-foreground">Recommended</span>
                        </Label>
                        <Switch
                          id="protect-on-set-pin"
                          checked={protectOnSetPin}
                          onCheckedChange={setProtectOnSetPin}
                          disabled={isSettingPin}
                          aria-label="Require this PIN to erase the card"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {protectOnSetPin ? (
                          <>
                            Nobody can wipe this card without the PIN. <strong>Keep the PIN safe:</strong> if you
                            lose it, or use up all 5 attempts, the card can never be read or erased again &mdash;
                            it becomes a paperweight, and whatever is stored on it is gone.
                          </>
                        ) : (
                          <>
                            <strong>Anyone holding this card can erase it</strong> with a card reader &mdash; no PIN
                            needed. Losing the PIN still makes the data unreadable; leaving this off only means the
                            card itself can be wiped and reused.
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (newPinInput) {
                            copyWithAutoClear(newPinInput);
                            toast({ title: 'Copied to clipboard!', description: 'Your PIN has been copied. Clipboard clears in 60s.' });
                          }
                        }}
                        disabled={!newPinInput}
                        aria-label="Copy PIN"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const pin = generatePin();
                          setNewPinInput(pin);
                          setConfirmPinInput(pin);
                          copyWithAutoClear(pin);
                          toast({ title: 'PIN Generated & Copied', description: 'A secure 16-character PIN has been generated and copied to your clipboard. Clipboard clears in 60s. Save it somewhere safe!' });
                        }}
                        disabled={isSettingPin}
                      >
                        <Dices className="mr-2 h-4 w-4" />
                        Generate PIN
                      </Button>
                      <Button
                        onClick={handleSetPin}
                        disabled={!setPinValid || isSettingPin}
                        className="ml-auto"
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
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              C2. Wipe Protection
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && cardStatus.pin_set && !needsPinUnlock && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  {cardStatus.wipe_protected ? (
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                  ) : (
                    <ShieldOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  Wipe Protection
                  {cardStatus.wipe_protected && (
                    <span className="text-xs font-medium bg-green-500/15 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {cardStatus.wipe_protected
                    ? 'The PIN is required to erase this card. Nobody can factory-reset it without the PIN — and if the PIN is lost, the card can never be read or erased again.'
                    : 'Right now this card can be erased by anyone holding it, using any card reader — no PIN needed. Turn this on to require the PIN before the card can be wiped.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!cardStatus.wipe_protected && (
                  <Alert className="border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-sm">
                      <strong>This card is not protected from erasure.</strong> Anyone who holds it can factory-reset
                      it with a card reader &mdash; no PIN needed, and no trace left behind. If it is one of several
                      Qards in an inheritance set, losing it that way quietly raises the number of remaining Qards
                      your heirs must find.
                    </AlertDescription>
                  </Alert>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant={cardStatus.wipe_protected ? 'outline' : 'default'}
                      disabled={isTogglingWipeProtect}
                      className="w-full sm:w-auto"
                    >
                      {isTogglingWipeProtect ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {cardStatus.wipe_protected ? 'Disabling...' : 'Enabling...'}
                        </>
                      ) : cardStatus.wipe_protected ? (
                        <>
                          <ShieldOff className="mr-2 h-4 w-4" />
                          Disable Wipe Protection
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Enable Wipe Protection
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {cardStatus.wipe_protected ? 'Disable Wipe Protection?' : 'Enable Wipe Protection?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {cardStatus.wipe_protected
                          ? (
                            <>
                              The PIN will no longer be needed to erase this card. Anyone holding it, with any card
                              reader, will be able to wipe it.
                              <br /><br />
                              This does not make the stored data any easier to reach &mdash; reading still requires
                              the PIN. It only makes the card destroyable, and reusable.
                            </>
                          )
                          : (
                            <>
                              The PIN will be required to erase this card. Nobody can wipe it without the PIN.
                              <br /><br />
                              <strong>Keep the PIN safe. If you lose it, or use up all 5 attempts, this card can
                              never be read or erased again &mdash; it becomes a paperweight, and whatever is stored
                              on it is gone.</strong> Losing the PIN already makes the data unreadable; this only
                              removes the option of wiping the card to reuse it.
                            </>
                          )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleToggleWipeProtect}
                        className={cardStatus.wipe_protected ? '' : 'bg-primary hover:bg-primary/90'}
                      >
                        {cardStatus.wipe_protected ? 'Yes, Disable' : 'Yes, Enable Wipe Protection'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}

            </TabsContent>

            {/* ── Tab 3: Advanced ── */}
            <TabsContent value="advanced" className="space-y-6">

          {/* ═══════════════════════════════════════════════════════════════
              Clone Card
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && !needsPinUnlock && cardStatus.has_data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CopyCheck className="h-5 w-5" />
                  Clone Card
                </CardTitle>
                <CardDescription>
                  Read all items from this card and write them to another card.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cloneStep === 'idle' && (
                  <Button onClick={handleCloneRead} className="w-full sm:w-auto">
                    <CopyCheck className="mr-2 h-4 w-4" />
                    Read Source Card
                  </Button>
                )}

                {cloneStep === 'reading' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading source card...
                  </div>
                )}

                {(cloneStep === 'ready' || cloneStep === 'writing') && (
                  <div className="space-y-4">
                    {/* Items summary */}
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <p className="text-sm font-medium">
                        {clonedItems.length} item{clonedItems.length !== 1 ? 's' : ''} ready to clone:
                      </p>
                      {clonedItems.map((item, i) => (
                        <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="capitalize font-medium">{item.item_type}</span>
                          {item.label && <span>&mdash; {item.label}</span>}
                          <span className="text-xs">({item.data.length}B)</span>
                        </div>
                      ))}
                    </div>

                    {/* Destination: multi-reader picker or swap prompt */}
                    {readers.length > 1 ? (
                      <div className="space-y-1.5">
                        <Label>Destination Reader</Label>
                        <Select value={cloneDestReader} onValueChange={setCloneDestReader}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select destination reader..." />
                          </SelectTrigger>
                          <SelectContent>
                            {readers
                              .filter((r) => r !== selectedReader)
                              .map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Remove the source card and insert the destination card into your reader before writing.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Destination PIN (optional) */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clone-dest-pin">Destination Card PIN (if set)</Label>
                      <Input
                        id="clone-dest-pin"
                        type="password"
                        placeholder="Leave blank if no PIN"
                        maxLength={16}
                        value={cloneDestPin}
                        onChange={(e) => setCloneDestPin(asciiOnly(e.target.value))}
                        disabled={cloneStep === 'writing'}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleCloneReset}
                        disabled={cloneStep === 'writing'}
                      >
                        Cancel
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            disabled={cloneStep === 'writing' || (readers.length > 1 && !cloneDestReader)}
                          >
                            {cloneStep === 'writing' ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Writing...
                              </>
                            ) : (
                              <>
                                <CopyCheck className="mr-2 h-4 w-4" />
                                Write to Card
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Clone to Destination Card?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will overwrite all existing data on the destination card with {clonedItems.length} item{clonedItems.length !== 1 ? 's' : ''} from the source card.
                              <br /><br />
                              <strong>Any existing data on the destination card will be replaced.</strong>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleCloneWrite}>
                              Yes, Clone
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              D. Erase / Factory Reset
              ═══════════════════════════════════════════════════════════ */}
          {cardStatus && (
            <Card className="border-destructive/30 dark:border-destructive/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Factory Reset
                </CardTitle>
                <CardDescription>
                  {needsPinUnlock && cardStatus.wipe_protected
                    ? 'This card is locked, and the PIN is required to erase it. Without the PIN it can be neither read nor erased. If all 5 attempts are used up, the card is a paperweight and the data on it is gone.'
                    : needsPinUnlock
                    ? 'This card is locked, so the data on it can no longer be read. A factory reset erases everything and removes the PIN, returning the card to a blank, reusable state — it does not recover the data.'
                    : 'Completely erase this card — removes all stored data AND the PIN. The card will be returned to a blank, unprotected state that anyone can write to or wipe.'}
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
                      {cardStatus.wipe_protected && <li>Wipe protection</li>}
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
                      disabled={isErasing || (!!needsPinUnlock && !!cardStatus.wipe_protected)}
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
                        {needsPinUnlock
                          ? 'This card is locked due to too many incorrect PIN attempts. Factory reset will erase ALL data and remove the PIN, making the card usable again.'
                          : cardStatus.wipe_protected
                          ? 'This will permanently erase ALL data, remove the PIN, and disable wipe protection. The card will be returned to a blank, unprotected state.'
                          : 'This will permanently erase ALL data and remove the PIN from this card. The card will be returned to a blank, unprotected state.'}
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

            </TabsContent>
          </Tabs>

          {/* ── Error Display ── */}
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
        </div>
        <AppFooter />
      </div>

      {/* ── Smart Card Dialog for writing keyfile ── */}
      <SmartCardDialog
        open={showKeyfileSmartCard}
        onOpenChange={(open) => {
          setShowKeyfileSmartCard(open);
          if (!open) {
            setKeyfileData(null);
            setKeyfileName(null);
            loadCardStatus();
          }
        }}
        mode="write-vault"
        writeData={keyfileData || undefined}
        writeLabel={keyfileName || 'Keyfile'}
        writeItemType="keyfile"
      />
    </main>
  );
}
