import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Plus, Trash2, ShieldCheck, AlertTriangle, Info, KeyRound, Eye, EyeOff } from 'lucide-react';
import type {
  InheritancePlan,
  PlanInfo,
  Beneficiary,
  SecretSet,
  QardLocation,
  DeviceAccount,
  DigitalAsset,
  ProfessionalContact,
  EmergencyAccess,
} from '@/lib/inheritance-plan-types';
import { createBlankSecretSet } from '@/lib/inheritance-plan-types';

interface InheritancePlanFormProps {
  plan: InheritancePlan;
  onChange: (plan: InheritancePlan) => void;
  readOnly?: boolean;
}

// ── Three-state yes/no select ───────────────────────────────────────
// '' = not specified (the legacy/default state — the plan makes no claim).
// Radix Select can't represent an empty-string item value, so 'unspecified'
// is mapped back to '' on change.
function YesNoSelect({ value, onChange, disabled, yesLabel, noLabel }: {
  value: string;
  onChange: (v: '' | 'yes' | 'no') => void;
  disabled?: boolean;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <Select
      value={value === '' ? 'unspecified' : value}
      onValueChange={(v) => onChange(v === 'unspecified' ? '' : (v as 'yes' | 'no'))}
      disabled={disabled}
    >
      <SelectTrigger className="text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unspecified">Not specified</SelectItem>
        <SelectItem value="yes">{yesLabel}</SelectItem>
        <SelectItem value="no">{noLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Collapsible section wrapper ─────────────────────────────────────

function Section({
  id,
  number,
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  number: number;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/20 transition-colors text-left"
      >
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4 animate-in fade-in duration-300">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Sensitive field wrappers ────────────────────────────────────────
// Each instance holds its own visibility state, so entries rendered inside
// .map() (multiple Secret Sets, Devices, Assets) get independent toggles.

interface SensitiveFieldProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/** Single-line input that renders as dots (type="password") until toggled. */
function SensitiveInput({ value, onChange, disabled, placeholder, className }: SensitiveFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Hide value' : 'Show value'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Single-line input whose text (not the border or placeholder) blurs once
 * there's a value to hide. Implemented with `color: transparent` +
 * `text-shadow` so only the characters are obscured — the input chrome and
 * the placeholder stay crisp. Blur auto-activates the moment the user types
 * or pastes; the eye button reveals for a quick accuracy check.
 */
function BlurInput({ value, onChange, disabled, placeholder, className }: SensitiveFieldProps) {
  const [visible, setVisible] = useState(false);
  const shouldBlur = !visible && value.length > 0;
  return (
    <div className="relative">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn('pr-10', className)}
        style={
          shouldBlur
            ? {
                color: 'transparent',
                textShadow: '0 0 8px hsl(var(--foreground) / 0.6)',
                caretColor: 'hsl(var(--foreground))',
              }
            : undefined
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Hide value' : 'Show value'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Main form component ─────────────────────────────────────────────

export function InheritancePlanForm({ plan, onChange, readOnly = false }: InheritancePlanFormProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['planInfo']));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Helpers for updating nested state ──

  const updatePlanInfo = (field: keyof PlanInfo, value: string) => {
    onChange({ ...plan, planInfo: { ...plan.planInfo, [field]: value } });
  };

  const updateBeneficiary = (id: string, field: keyof Omit<Beneficiary, 'id'>, value: string) => {
    onChange({
      ...plan,
      beneficiaries: plan.beneficiaries.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    });
  };

  const addBeneficiary = () => {
    onChange({
      ...plan,
      beneficiaries: [
        ...plan.beneficiaries,
        { id: crypto.randomUUID(), name: '', relationship: '', contactInfo: '', assignedAssets: '' },
      ],
    });
  };

  const removeBeneficiary = (id: string) => {
    onChange({ ...plan, beneficiaries: plan.beneficiaries.filter((b) => b.id !== id) });
  };

  // ── Secret Set helpers ──

  const updateSecretSet = <K extends keyof Omit<SecretSet, 'id' | 'qardLocations'>>(id: string, field: K, value: SecretSet[K]) => {
    onChange({
      ...plan,
      secretSets: plan.secretSets.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    });
  };

  const addSecretSet = () => {
    onChange({ ...plan, secretSets: [...plan.secretSets, createBlankSecretSet()] });
  };

  const removeSecretSet = (id: string) => {
    onChange({ ...plan, secretSets: plan.secretSets.filter((s) => s.id !== id) });
  };

  const updateQardLocation = (setId: string, locId: string, field: keyof Omit<QardLocation, 'id' | 'qardNumber'>, value: string) => {
    onChange({
      ...plan,
      secretSets: plan.secretSets.map((s) =>
        s.id === setId
          ? { ...s, qardLocations: s.qardLocations.map((loc) => (loc.id === locId ? { ...loc, [field]: value } : loc)) }
          : s,
      ),
    });
  };

  const addQardLocation = (setId: string) => {
    onChange({
      ...plan,
      secretSets: plan.secretSets.map((s) =>
        s.id === setId
          ? {
              ...s,
              qardLocations: [
                ...s.qardLocations,
                { id: crypto.randomUUID(), qardNumber: s.qardLocations.length + 1, location: '', heldBy: '', accessNotes: '' },
              ],
            }
          : s,
      ),
    });
  };

  const removeQardLocation = (setId: string, locId: string) => {
    onChange({
      ...plan,
      secretSets: plan.secretSets.map((s) =>
        s.id === setId
          ? {
              ...s,
              qardLocations: s.qardLocations
                .filter((loc) => loc.id !== locId)
                .map((loc, i) => ({ ...loc, qardNumber: i + 1 })),
            }
          : s,
      ),
    });
  };

  // ── Device, Asset, Contact helpers ──

  const updateDeviceAccount = (id: string, field: keyof Omit<DeviceAccount, 'id'>, value: string) => {
    onChange({
      ...plan,
      deviceAccounts: plan.deviceAccounts.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    });
  };

  const addDeviceAccount = () => {
    onChange({
      ...plan,
      deviceAccounts: [
        ...plan.deviceAccounts,
        { id: crypto.randomUUID(), label: '', type: '', location: '', username: '', password: '', notes: '' },
      ],
    });
  };

  const removeDeviceAccount = (id: string) => {
    onChange({ ...plan, deviceAccounts: plan.deviceAccounts.filter((d) => d.id !== id) });
  };

  const updateAsset = <K extends keyof Omit<DigitalAsset, 'id'>>(id: string, field: K, value: DigitalAsset[K]) => {
    onChange({
      ...plan,
      digitalAssets: plan.digitalAssets.map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    });
  };

  const addAsset = () => {
    onChange({
      ...plan,
      digitalAssets: [
        ...plan.digitalAssets,
        { id: crypto.randomUUID(), name: '', type: '', platform: '', loginEmail: '', approxValue: '', twoFactorMethod: '', recoverySeed: '', walletKind: '', usesPassphrase: '', derivationPath: '', multisigDescriptorLocation: '', multisigCosigners: '', specialInstructions: '' },
      ],
    });
  };

  const removeAsset = (id: string) => {
    onChange({ ...plan, digitalAssets: plan.digitalAssets.filter((a) => a.id !== id) });
  };

  const updateContact = (id: string, field: keyof Omit<ProfessionalContact, 'id'>, value: string) => {
    onChange({
      ...plan,
      professionalContacts: plan.professionalContacts.map((c) =>
        c.id === id ? { ...c, [field]: value } : c,
      ),
    });
  };

  const addContact = () => {
    onChange({
      ...plan,
      professionalContacts: [
        ...plan.professionalContacts,
        { id: crypto.randomUUID(), role: '', name: '', phone: '', email: '' },
      ],
    });
  };

  const removeContact = (id: string) => {
    onChange({ ...plan, professionalContacts: plan.professionalContacts.filter((c) => c.id !== id) });
  };

  const updateEmergencyAccess = (field: keyof EmergencyAccess, value: string) => {
    onChange({ ...plan, emergencyAccess: { ...plan.emergencyAccess, [field]: value } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
        <ShieldCheck className="h-4 w-4" />
        <span>All data stays local and will be encrypted before saving.</span>
      </div>

      {/* ── 1. Plan Information ── */}
      <Section id="planInfo" number={1} title="Plan Information" description="Who created this plan, version tracking, and review schedule" expanded={expanded.has('planInfo')} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Prepared by</Label>
            <Input value={plan.planInfo.preparedBy} onChange={(e) => updatePlanInfo('preparedBy', e.target.value)} disabled={readOnly} placeholder="Your full legal name" />
          </div>
          <div className="space-y-1.5">
            <Label>Date created</Label>
            <Input value={plan.planInfo.dateCreated} onChange={(e) => updatePlanInfo('dateCreated', e.target.value)} disabled={readOnly} type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Last updated</Label>
            <Input value={plan.planInfo.lastUpdated} onChange={(e) => updatePlanInfo('lastUpdated', e.target.value)} disabled={readOnly} type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Review schedule</Label>
            <Input value={plan.planInfo.reviewSchedule} onChange={(e) => updatePlanInfo('reviewSchedule', e.target.value)} disabled={readOnly} placeholder="e.g., Every 6 months" />
          </div>
          <div className="space-y-1.5">
            <Label>Plan version</Label>
            <Input value={plan.planInfo.planVersion} onChange={(e) => updatePlanInfo('planVersion', e.target.value)} disabled={readOnly} placeholder="e.g., 1.0, 2.0" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Change log</Label>
            <Textarea value={plan.planInfo.changeLog} onChange={(e) => updatePlanInfo('changeLog', e.target.value)} disabled={readOnly} placeholder="Track what changed between versions, e.g.:&#10;v2.0 — Added new Bitcoin wallet, updated Qard locations&#10;v1.0 — Initial plan" className="text-sm min-h-[60px]" />
          </div>
        </div>
      </Section>

      {/* ── 2. Beneficiaries ── */}
      <Section id="beneficiaries" number={2} title="Beneficiaries" description="Who should receive your digital assets" expanded={expanded.has('beneficiaries')} onToggle={toggle}>
        <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>This documents your wishes for digital asset distribution. It does not replace a legal will.</span>
        </div>
        <div className="space-y-4">
          {plan.beneficiaries.map((beneficiary, idx) => (
            <div key={beneficiary.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground">Beneficiary {idx + 1}</h4>
                {!readOnly && plan.beneficiaries.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeBeneficiary(beneficiary.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={beneficiary.name} onChange={(e) => updateBeneficiary(beneficiary.id, 'name', e.target.value)} disabled={readOnly} placeholder="Full legal name" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Relationship</Label>
                  <Input value={beneficiary.relationship} onChange={(e) => updateBeneficiary(beneficiary.id, 'relationship', e.target.value)} disabled={readOnly} placeholder="e.g., Spouse, Son, Daughter" className="text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact info</Label>
                <Input value={beneficiary.contactInfo} onChange={(e) => updateBeneficiary(beneficiary.id, 'contactInfo', e.target.value)} disabled={readOnly} placeholder="Phone, email, or address" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Assigned assets</Label>
                <Textarea value={beneficiary.assignedAssets} onChange={(e) => updateBeneficiary(beneficiary.id, 'assignedAssets', e.target.value)} disabled={readOnly} placeholder="Which digital assets should this person receive?" className="text-sm min-h-[60px]" />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label>Distribution instructions</Label>
          <Textarea value={plan.distributionInstructions} onChange={(e) => onChange({ ...plan, distributionInstructions: e.target.value })} disabled={readOnly} placeholder="Any conditions, timing, or special instructions for distribution (optional)" className="text-sm min-h-[60px]" />
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addBeneficiary} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Beneficiary
          </Button>
        )}
      </Section>

      {/* ── 3. Secret Sets (Recovery Credentials + Qard Locations) ── */}
      <Section id="secretSets" number={3} title="seQRet Sets" description="Credentials, Qard locations, and smart card info for each secret protected by seQRets" expanded={expanded.has('secretSets')} onToggle={toggle}>
        <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Safe to include here — this entire plan will be encrypted before saving.</span>
        </div>

        <div className="space-y-6">
          {plan.secretSets.map((secret, idx) => (
            <div key={secret.id} className="border-2 border-border rounded-xl p-4 space-y-4 bg-card/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-bold">seQRet {idx + 1}</h4>
                </div>
                {!readOnly && plan.secretSets.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSecretSet(secret.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>What does this secret protect?</Label>
                <Input value={secret.description} onChange={(e) => updateSecretSet(secret.id, 'description', e.target.value)} disabled={readOnly} placeholder="e.g., Bitcoin wallet seed phrase, Master password, Exchange recovery key" />
              </div>

              {/* Credentials */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{secret.passwordIsHint ? 'seQRets Password Hint' : 'seQRets Password'}</Label>
                  <SensitiveInput value={secret.password} onChange={(v) => updateSecretSet(secret.id, 'password', v)} disabled={readOnly} placeholder={secret.passwordIsHint ? 'A hint your heirs will understand — not the password itself' : 'The exact password used when encrypting this secret'} />
                  <p className="text-xs text-muted-foreground">Every character matters. Copy-paste recommended.</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch id={`pw-hint-${secret.id}`} checked={secret.passwordIsHint} onCheckedChange={(on) => updateSecretSet(secret.id, 'passwordIsHint', on)} disabled={readOnly} />
                    <Label htmlFor={`pw-hint-${secret.id}`} className="text-xs font-normal text-muted-foreground">This is a hint, not the actual password</Label>
                  </div>
                  {secret.passwordIsHint && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">The plan will clearly mark this as a hint — an heir who types a hint as the password gets an error identical to a wrong password.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Was a keyfile used for this secret?</Label>
                  <YesNoSelect
                    value={secret.keyfileUsed}
                    onChange={(v) => updateSecretSet(secret.id, 'keyfileUsed', v)}
                    disabled={readOnly}
                    yesLabel="Yes — required to decrypt"
                    noLabel="No — password and Qards only"
                  />
                  <p className="text-xs text-muted-foreground">Say so explicitly. If a keyfile was used but your heirs don't know, decryption fails with what looks like a wrong-password error.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Keyfile location (primary)</Label>
                    <Input value={secret.keyfilePrimaryLocation} onChange={(e) => updateSecretSet(secret.id, 'keyfilePrimaryLocation', e.target.value)} disabled={readOnly} placeholder="e.g., Smart card, USB drive in lockbox" className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Keyfile location (backup)</Label>
                    <Input value={secret.keyfileBackupLocation} onChange={(e) => updateSecretSet(secret.id, 'keyfileBackupLocation', e.target.value)} disabled={readOnly} placeholder="Backup copy location" className="text-sm" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Qard config + locations */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Configuration</Label>
                  <Input value={secret.configuration} onChange={(e) => updateSecretSet(secret.id, 'configuration', e.target.value)} disabled={readOnly} placeholder="e.g., 2-of-3, 3-of-5" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Qard set label</Label>
                  <Input value={secret.label} onChange={(e) => updateSecretSet(secret.id, 'label', e.target.value)} disabled={readOnly} placeholder="The label you set in seQRets" className="text-sm" />
                </div>
              </div>

              <div className="space-y-3">
                {secret.qardLocations.map((loc) => (
                  <div key={loc.id} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-start">
                    <div className="flex items-center justify-center h-9 w-9 rounded-md bg-muted text-sm font-semibold shrink-0">
                      {loc.qardNumber}
                    </div>
                    <Input value={loc.location} onChange={(e) => updateQardLocation(secret.id, loc.id, 'location', e.target.value)} disabled={readOnly} placeholder="Location" className="text-sm" />
                    <Input value={loc.heldBy} onChange={(e) => updateQardLocation(secret.id, loc.id, 'heldBy', e.target.value)} disabled={readOnly} placeholder="Held by" className="text-sm" />
                    <Input value={loc.accessNotes} onChange={(e) => updateQardLocation(secret.id, loc.id, 'accessNotes', e.target.value)} disabled={readOnly} placeholder="Access notes" className="text-sm" />
                    {!readOnly && secret.qardLocations.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeQardLocation(secret.id, loc.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {!readOnly && (
                <Button variant="outline" size="sm" onClick={() => addQardLocation(secret.id)} className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> Add Qard
                </Button>
              )}

              <Separator />

              {/* Smart card & vault file */}
              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Smart Card & Vault Backup</h5>
                <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-500/30 dark:border-yellow-500/20 text-xs text-yellow-800 dark:text-yellow-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                  <span><strong>PIN lockout.</strong> After 5 wrong attempts the card locks permanently and its data can no longer be read &mdash; record the PIN above and make sure whoever needs it can actually reach it. With wipe protection on (the default) the card cannot be erased either, so a lost PIN turns it into a paperweight. With wipe protection off, anyone who holds the card can erase it &mdash; losing that Qard without warning and raising the number your heirs must still find.</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Smart card PIN</Label>
                    <SensitiveInput value={secret.smartCardPin} onChange={(v) => updateSecretSet(secret.id, 'smartCardPin', v)} disabled={readOnly} placeholder="Card PIN" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Card reader model</Label>
                    <Input value={secret.smartCardReaderModel} onChange={(e) => updateSecretSet(secret.id, 'smartCardReaderModel', e.target.value)} disabled={readOnly} placeholder="e.g., Identiv SCR3310 v2.0" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vault file location</Label>
                    <Input value={secret.vaultFileLocation} onChange={(e) => updateSecretSet(secret.id, 'vaultFileLocation', e.target.value)} disabled={readOnly} placeholder="e.g., USB drive, cloud folder" className="text-sm" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addSecretSet} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Another seQRet Set
          </Button>
        )}
      </Section>

      {/* ── 4. Device & Account Access ── */}
      <Section id="devices" number={4} title="Device &amp; Account Access" description="Computers, password managers, backup drives, and other access your heirs will need" expanded={expanded.has('devices')} onToggle={toggle}>
        <div className="flex items-start gap-2 p-3 rounded-md bg-muted border border-border text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-foreground" />
          <div className="space-y-1">
            <span>List every device and account your heirs will need — computers, password managers, 2FA apps, backup drives, email, cloud storage, VPN, phone PINs, and subscriptions to cancel. <strong className="text-foreground">Tip:</strong> If your 2FA app requires your password manager and vice versa, list the 2FA recovery codes separately to break the deadlock.</span>
          </div>
        </div>
        <div className="space-y-4">
          {plan.deviceAccounts.map((device, idx) => (
            <div key={device.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground">Device / Account {idx + 1}</h4>
                {!readOnly && plan.deviceAccounts.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeDeviceAccount(device.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input value={device.label} onChange={(e) => updateDeviceAccount(device.id, 'label', e.target.value)} disabled={readOnly} placeholder="e.g., MacBook Pro, 1Password" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Input value={device.type} onChange={(e) => updateDeviceAccount(device.id, 'type', e.target.value)} disabled={readOnly} placeholder="Computer, Password Manager, Backup Drive" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input value={device.location} onChange={(e) => updateDeviceAccount(device.id, 'location', e.target.value)} disabled={readOnly} placeholder="e.g., Home office, fireproof safe" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Username / login</Label>
                  <Input value={device.username} onChange={(e) => updateDeviceAccount(device.id, 'username', e.target.value)} disabled={readOnly} placeholder="e.g., john@email.com" className="text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password / PIN / encryption key</Label>
                <SensitiveInput value={device.password} onChange={(v) => updateDeviceAccount(device.id, 'password', v)} disabled={readOnly} placeholder="The exact password or PIN needed to unlock" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input value={device.notes} onChange={(e) => updateDeviceAccount(device.id, 'notes', e.target.value)} disabled={readOnly} placeholder="e.g., FileVault enabled, recovery key in 1Password" className="text-sm" />
              </div>
            </div>
          ))}
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addDeviceAccount} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Device / Account
          </Button>
        )}
      </Section>

      {/* ── 5. Digital Asset Inventory ── */}
      <Section id="assets" number={5} title="Digital Asset Inventory" description="Every digital asset your heirs need to know about" expanded={expanded.has('assets')} onToggle={toggle}>
        <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-500/30 dark:border-yellow-500/20 text-xs text-yellow-800 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <span><strong>Multisig wallet?</strong> Export your wallet's descriptor / config file (Sparrow, Electrum and Specter all offer this) and store it with this plan. The descriptor is <em>not</em> a spending secret like your seed — but without it, your heirs may be unable to reconstruct the wallet at all, even with enough seed phrases.</span>
        </div>
        <div className="space-y-4">
          {plan.digitalAssets.map((asset, idx) => (
            <div key={asset.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground">Asset {idx + 1}</h4>
                {!readOnly && plan.digitalAssets.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeAsset(asset.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={asset.name} onChange={(e) => updateAsset(asset.id, 'name', e.target.value)} disabled={readOnly} placeholder="e.g., Bitcoin Wallet" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Input value={asset.type} onChange={(e) => updateAsset(asset.id, 'type', e.target.value)} disabled={readOnly} placeholder="Wallet, exchange, etc." className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Platform / software</Label>
                  <Input value={asset.platform} onChange={(e) => updateAsset(asset.id, 'platform', e.target.value)} disabled={readOnly} placeholder="e.g., Electrum, Coinbase" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Login email</Label>
                  <Input value={asset.loginEmail} onChange={(e) => updateAsset(asset.id, 'loginEmail', e.target.value)} disabled={readOnly} placeholder="account@email.com" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Approx. value</Label>
                  <Input value={asset.approxValue} onChange={(e) => updateAsset(asset.id, 'approxValue', e.target.value)} disabled={readOnly} placeholder="e.g., $50,000" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">2FA method & backup codes</Label>
                  <Input value={asset.twoFactorMethod} onChange={(e) => updateAsset(asset.id, 'twoFactorMethod', e.target.value)} disabled={readOnly} placeholder="Authenticator, SMS, etc." className="text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Recovery seed / key</Label>
                <BlurInput value={asset.recoverySeed} onChange={(v) => updateAsset(asset.id, 'recoverySeed', v)} disabled={readOnly} placeholder='If protected by seQRets, reference the seQRet Set number here (e.g., "Protected by seQRets — seQRet 1")' className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Wallet kind</Label>
                  <Input value={asset.walletKind} onChange={(e) => updateAsset(asset.id, 'walletKind', e.target.value)} disabled={readOnly} placeholder="Single-sig, Multisig 2-of-3, Hardware, Exchange" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Uses an added passphrase ("25th word")?</Label>
                  <YesNoSelect
                    value={asset.usesPassphrase}
                    onChange={(v) => updateAsset(asset.id, 'usesPassphrase', v)}
                    disabled={readOnly}
                    yesLabel="Yes — seed alone opens an empty wallet"
                    noLabel="No — seed phrase is sufficient"
                  />
                </div>
              </div>
              {asset.usesPassphrase === 'yes' && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Make sure the passphrase itself is protected and its location documented — in Special instructions below, or as its own seQRet Set. Without it the funds are unreachable.</p>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Derivation path / script type</Label>
                <Input value={asset.derivationPath} onChange={(e) => updateAsset(asset.id, 'derivationPath', e.target.value)} disabled={readOnly} placeholder={'e.g., Native SegWit (BIP84), m/84\'/0\'/0\' — or "wallet default" if unsure'} className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Multisig descriptor / config file location</Label>
                  <Input value={asset.multisigDescriptorLocation} onChange={(e) => updateAsset(asset.id, 'multisigDescriptorLocation', e.target.value)} disabled={readOnly} placeholder="e.g., USB in safe, printed with this plan" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Multisig cosigners (who holds which key)</Label>
                  <Input value={asset.multisigCosigners} onChange={(e) => updateAsset(asset.id, 'multisigCosigners', e.target.value)} disabled={readOnly} placeholder="e.g., Key 1 me, Key 2 spouse, Key 3 attorney" className="text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Special instructions</Label>
                <Textarea value={asset.specialInstructions} onChange={(e) => updateAsset(asset.id, 'specialInstructions', e.target.value)} disabled={readOnly} placeholder="Any special steps needed to access this asset" className="text-sm min-h-[60px]" />
              </div>
            </div>
          ))}
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addAsset} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Asset
          </Button>
        )}
      </Section>

      {/* ── 6. How to Restore ── */}
      <Section id="restore" number={6} title="How to Restore Your Secret" description="Step-by-step instructions for your heirs" expanded={expanded.has('restore')} onToggle={toggle}>
        <p className="text-xs text-muted-foreground">Pre-filled with default steps. Edit freely to match your setup.</p>
        <Textarea
          value={plan.howToRestore}
          onChange={(e) => onChange({ ...plan, howToRestore: e.target.value })}
          disabled={readOnly}
          rows={12}
          className="text-sm font-mono"
        />
      </Section>

      {/* ── 7. Professional Contacts ── */}
      <Section id="contacts" number={7} title="Professional Contacts" description="People who can help your heirs execute this plan" expanded={expanded.has('contacts')} onToggle={toggle}>
        <div className="space-y-3">
          {plan.professionalContacts.map((contact) => (
            <div key={contact.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-start">
              <div className="space-y-1">
                <Input value={contact.role} onChange={(e) => updateContact(contact.id, 'role', e.target.value)} disabled={readOnly} placeholder="Role" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Input value={contact.name} onChange={(e) => updateContact(contact.id, 'name', e.target.value)} disabled={readOnly} placeholder="Name" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Input value={contact.phone} onChange={(e) => updateContact(contact.id, 'phone', e.target.value)} disabled={readOnly} placeholder="Phone" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Input value={contact.email} onChange={(e) => updateContact(contact.id, 'email', e.target.value)} disabled={readOnly} placeholder="Email" className="text-sm" />
              </div>
              {!readOnly && plan.professionalContacts.length > 1 && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeContact(contact.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addContact} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Contact
          </Button>
        )}
      </Section>

      {/* ── 8. Emergency Access ── */}
      <Section id="emergency" number={8} title="Emergency Access" description="What happens if you are incapacitated but still alive" expanded={expanded.has('emergency')} onToggle={toggle}>
        <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-500/30 dark:border-yellow-500/20 text-xs text-yellow-800 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <span><strong>Not just for death.</strong> If you are hospitalized, in a coma, or otherwise unable to act, someone may need access to pay bills, meet margin calls, or handle time-sensitive obligations.</span>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Emergency contact (decision maker)</Label>
            <Input value={plan.emergencyAccess.emergencyContact} onChange={(e) => updateEmergencyAccess('emergencyContact', e.target.value)} disabled={readOnly} placeholder="Name, relationship, phone, email" />
          </div>
          <div className="space-y-1.5">
            <Label>Trigger conditions</Label>
            <Textarea value={plan.emergencyAccess.triggerConditions} onChange={(e) => updateEmergencyAccess('triggerConditions', e.target.value)} disabled={readOnly} placeholder='e.g., "If I am hospitalized for more than 7 days"' className="text-sm min-h-[60px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Emergency access procedure</Label>
            <Textarea value={plan.emergencyAccess.accessProcedure} onChange={(e) => updateEmergencyAccess('accessProcedure', e.target.value)} disabled={readOnly} placeholder="Step-by-step instructions for accessing assets during an emergency" className="text-sm min-h-[60px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Immediate actions required</Label>
            <Textarea value={plan.emergencyAccess.immediateActions} onChange={(e) => updateEmergencyAccess('immediateActions', e.target.value)} disabled={readOnly} placeholder="Time-sensitive obligations: bills, mortgage, insurance, margin calls, etc." className="text-sm min-h-[60px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Scope limitations</Label>
            <Textarea value={plan.emergencyAccess.scopeLimitations} onChange={(e) => updateEmergencyAccess('scopeLimitations', e.target.value)} disabled={readOnly} placeholder='e.g., "Do not sell any Bitcoin unless absolutely necessary for medical bills"' className="text-sm min-h-[60px]" />
          </div>
        </div>
      </Section>

      {/* ── 9. Personal Message ── */}
      <Section id="message" number={9} title="Personal Message to Your Heirs" description="Optional — anything else you want your family to know" expanded={expanded.has('message')} onToggle={toggle}>
        <Textarea
          value={plan.personalMessage}
          onChange={(e) => onChange({ ...plan, personalMessage: e.target.value })}
          disabled={readOnly}
          rows={5}
          placeholder="Write a personal message to your heirs..."
          className="text-sm"
        />
      </Section>
    </div>
  );
}
