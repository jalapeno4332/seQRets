import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Plus, Trash2, ShieldCheck } from 'lucide-react';
import type {
  InheritancePlan,
  PlanInfo,
  RecoveryCredentials,
  QardConfig,
  QardLocation,
  DigitalAsset,
  ProfessionalContact,
} from '@/lib/inheritance-plan-types';

interface InheritancePlanFormProps {
  plan: InheritancePlan;
  onChange: (plan: InheritancePlan) => void;
  readOnly?: boolean;
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

  const updateCredentials = (field: keyof RecoveryCredentials, value: string) => {
    onChange({ ...plan, recoveryCredentials: { ...plan.recoveryCredentials, [field]: value } });
  };

  const updateQardConfig = (field: keyof Omit<QardConfig, 'locations'>, value: string) => {
    onChange({ ...plan, qardConfig: { ...plan.qardConfig, [field]: value } });
  };

  const updateQardLocation = (id: string, field: keyof Omit<QardLocation, 'id' | 'qardNumber'>, value: string) => {
    onChange({
      ...plan,
      qardConfig: {
        ...plan.qardConfig,
        locations: plan.qardConfig.locations.map((loc) =>
          loc.id === id ? { ...loc, [field]: value } : loc,
        ),
      },
    });
  };

  const addQardLocation = () => {
    const nextNum = plan.qardConfig.locations.length + 1;
    onChange({
      ...plan,
      qardConfig: {
        ...plan.qardConfig,
        locations: [
          ...plan.qardConfig.locations,
          { id: crypto.randomUUID(), qardNumber: nextNum, location: '', heldBy: '', accessNotes: '' },
        ],
      },
    });
  };

  const removeQardLocation = (id: string) => {
    const filtered = plan.qardConfig.locations.filter((loc) => loc.id !== id);
    onChange({
      ...plan,
      qardConfig: {
        ...plan.qardConfig,
        locations: filtered.map((loc, i) => ({ ...loc, qardNumber: i + 1 })),
      },
    });
  };

  const updateAsset = (id: string, field: keyof Omit<DigitalAsset, 'id'>, value: string) => {
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
        { id: crypto.randomUUID(), name: '', type: '', platform: '', loginEmail: '', approxValue: '', twoFactorMethod: '', recoverySeed: '', specialInstructions: '' },
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
        <ShieldCheck className="h-4 w-4" />
        <span>All data stays local and will be encrypted before saving.</span>
      </div>

      {/* ── 1. Plan Information ── */}
      <Section id="planInfo" number={1} title="Plan Information" description="Who created this plan and when" expanded={expanded.has('planInfo')} onToggle={toggle}>
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
          <div className="col-span-2 space-y-1.5">
            <Label>Review schedule</Label>
            <Input value={plan.planInfo.reviewSchedule} onChange={(e) => updatePlanInfo('reviewSchedule', e.target.value)} disabled={readOnly} placeholder="e.g., Every 6 months" />
          </div>
        </div>
      </Section>

      {/* ── 2. Recovery Credentials ── */}
      <Section id="credentials" number={2} title="Recovery Credentials" description="Password and keyfile needed to decrypt your secret" expanded={expanded.has('credentials')} onToggle={toggle}>
        <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Safe to include here — this entire plan will be encrypted before saving.</span>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>seQRets Password</Label>
            <Input value={plan.recoveryCredentials.password} onChange={(e) => updateCredentials('password', e.target.value)} disabled={readOnly} placeholder="The exact password used when encrypting your secret" />
            <p className="text-xs text-muted-foreground">Every character matters. Copy-paste recommended.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Keyfile location (primary)</Label>
            <Input value={plan.recoveryCredentials.keyfilePrimaryLocation} onChange={(e) => updateCredentials('keyfilePrimaryLocation', e.target.value)} disabled={readOnly} placeholder="e.g., Smart card in home safe, USB drive in lockbox" />
          </div>
          <div className="space-y-1.5">
            <Label>Keyfile location (backup)</Label>
            <Input value={plan.recoveryCredentials.keyfileBackupLocation} onChange={(e) => updateCredentials('keyfileBackupLocation', e.target.value)} disabled={readOnly} placeholder="Where is the backup copy? Include any PINs needed." />
          </div>
        </div>
      </Section>

      {/* ── 3. Qard Locations ── */}
      <Section id="qards" number={3} title="Qard Locations" description="Where each Qard is stored and who holds it" expanded={expanded.has('qards')} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Configuration</Label>
            <Input value={plan.qardConfig.configuration} onChange={(e) => updateQardConfig('configuration', e.target.value)} disabled={readOnly} placeholder="e.g., 2-of-3, 3-of-5" />
          </div>
          <div className="space-y-1.5">
            <Label>Qard set label</Label>
            <Input value={plan.qardConfig.label} onChange={(e) => updateQardConfig('label', e.target.value)} disabled={readOnly} placeholder="The label you set in seQRets" />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          {plan.qardConfig.locations.map((loc) => (
            <div key={loc.id} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-start">
              <div className="flex items-center justify-center h-9 w-9 rounded-md bg-muted text-sm font-semibold shrink-0">
                {loc.qardNumber}
              </div>
              <div className="space-y-1">
                <Input value={loc.location} onChange={(e) => updateQardLocation(loc.id, 'location', e.target.value)} disabled={readOnly} placeholder="Location" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Input value={loc.heldBy} onChange={(e) => updateQardLocation(loc.id, 'heldBy', e.target.value)} disabled={readOnly} placeholder="Held by" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Input value={loc.accessNotes} onChange={(e) => updateQardLocation(loc.id, 'accessNotes', e.target.value)} disabled={readOnly} placeholder="Access notes" className="text-sm" />
              </div>
              {!readOnly && plan.qardConfig.locations.length > 1 && (
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeQardLocation(loc.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addQardLocation} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add Qard
          </Button>
        )}
      </Section>

      {/* ── 4. Digital Asset Inventory ── */}
      <Section id="assets" number={4} title="Digital Asset Inventory" description="Every digital asset your heirs need to know about" expanded={expanded.has('assets')} onToggle={toggle}>
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
                <Input value={asset.recoverySeed} onChange={(e) => updateAsset(asset.id, 'recoverySeed', e.target.value)} disabled={readOnly} placeholder='If protected by seQRets, write "Protected by seQRets Qards above."' className="text-sm" />
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

      {/* ── 5. How to Restore ── */}
      <Section id="restore" number={5} title="How to Restore Your Secret" description="Step-by-step instructions for your heirs" expanded={expanded.has('restore')} onToggle={toggle}>
        <p className="text-xs text-muted-foreground">Pre-filled with default steps. Edit freely to match your setup.</p>
        <Textarea
          value={plan.howToRestore}
          onChange={(e) => onChange({ ...plan, howToRestore: e.target.value })}
          disabled={readOnly}
          rows={12}
          className="text-sm font-mono"
        />
      </Section>

      {/* ── 6. Professional Contacts ── */}
      <Section id="contacts" number={6} title="Professional Contacts" description="People who can help your heirs execute this plan" expanded={expanded.has('contacts')} onToggle={toggle}>
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

      {/* ── 7. Personal Message ── */}
      <Section id="message" number={7} title="Personal Message to Your Heirs" description="Optional — anything else you want your family to know" expanded={expanded.has('message')} onToggle={toggle}>
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
