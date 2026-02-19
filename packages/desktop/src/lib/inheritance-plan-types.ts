// ── Inheritance Plan Types ──────────────────────────────────────────
// Defines the data model for the in-app inheritance plan builder.
// Plans are serialized to JSON, encrypted via the existing
// encryptInstructions pipeline, and stored on smart card or file.

export const INHERITANCE_PLAN_VERSION = 1;
export const INHERITANCE_PLAN_FILENAME = 'inheritance-plan.json';
export const INHERITANCE_PLAN_FILETYPE = 'application/json';

export interface PlanInfo {
  preparedBy: string;
  dateCreated: string;
  lastUpdated: string;
  reviewSchedule: string;
}

export interface RecoveryCredentials {
  password: string;
  keyfilePrimaryLocation: string;
  keyfileBackupLocation: string;
}

export interface QardLocation {
  id: string;
  qardNumber: number;
  location: string;
  heldBy: string;
  accessNotes: string;
}

export interface QardConfig {
  configuration: string;
  label: string;
  locations: QardLocation[];
}

export interface DigitalAsset {
  id: string;
  name: string;
  type: string;
  platform: string;
  loginEmail: string;
  approxValue: string;
  twoFactorMethod: string;
  recoverySeed: string;
  specialInstructions: string;
}

export interface ProfessionalContact {
  id: string;
  role: string;
  name: string;
  phone: string;
  email: string;
}

export interface InheritancePlan {
  version: number;
  planInfo: PlanInfo;
  recoveryCredentials: RecoveryCredentials;
  qardConfig: QardConfig;
  digitalAssets: DigitalAsset[];
  howToRestore: string;
  professionalContacts: ProfessionalContact[];
  personalMessage: string;
}

const DEFAULT_RESTORE_STEPS = `1. Download seQRets from seqrets.app or use the web app.
2. Open the app and click "Restore Secret".
3. Gather the required Qards from the locations listed in the Qard Locations section.
4. Import the Qards (scan QR, drag & drop, smart card, vault file, or paste text).
5. Enter the password from the Recovery Credentials section of this plan.
6. If a keyfile was used, toggle "Was a Keyfile used?" and load it from the location listed.
7. Click "Restore Secret".
8. Write down the restored secret on paper immediately. Do not save it digitally.
9. Use the restored secret to access your assets per the Digital Asset Inventory.
10. After securing all assets, delete all unencrypted copies of this document.`;

export function createBlankPlan(): InheritancePlan {
  const today = new Date().toISOString().split('T')[0];
  return {
    version: INHERITANCE_PLAN_VERSION,
    planInfo: {
      preparedBy: '',
      dateCreated: today,
      lastUpdated: today,
      reviewSchedule: 'Every 6 months',
    },
    recoveryCredentials: {
      password: '',
      keyfilePrimaryLocation: '',
      keyfileBackupLocation: '',
    },
    qardConfig: {
      configuration: '2-of-3',
      label: '',
      locations: [
        { id: crypto.randomUUID(), qardNumber: 1, location: '', heldBy: '', accessNotes: '' },
        { id: crypto.randomUUID(), qardNumber: 2, location: '', heldBy: '', accessNotes: '' },
        { id: crypto.randomUUID(), qardNumber: 3, location: '', heldBy: '', accessNotes: '' },
      ],
    },
    digitalAssets: [
      { id: crypto.randomUUID(), name: '', type: '', platform: '', loginEmail: '', approxValue: '', twoFactorMethod: '', recoverySeed: '', specialInstructions: '' },
    ],
    howToRestore: DEFAULT_RESTORE_STEPS,
    professionalContacts: [
      { id: crypto.randomUUID(), role: 'Estate Attorney', name: '', phone: '', email: '' },
      { id: crypto.randomUUID(), role: 'Financial Advisor', name: '', phone: '', email: '' },
      { id: crypto.randomUUID(), role: 'Technical Contact', name: '', phone: '', email: '' },
    ],
    personalMessage: '',
  };
}
