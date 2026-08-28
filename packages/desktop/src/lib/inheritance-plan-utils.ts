import type { InheritancePlan, SecretSet } from './inheritance-plan-types';
import { INHERITANCE_PLAN_FILENAME, INHERITANCE_PLAN_FILETYPE, INHERITANCE_PLAN_VERSION, createBlankSecretSet } from './inheritance-plan-types';
import type { RawInstruction } from './types';

/**
 * Serialize an InheritancePlan into a RawInstruction that feeds directly
 * into the existing encryptInstructions crypto pipeline.
 */
export function planToRawInstruction(plan: InheritancePlan): RawInstruction {
  const jsonString = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(jsonString);
  const base64Content = btoa(
    bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''),
  );
  return {
    fileName: INHERITANCE_PLAN_FILENAME,
    fileContent: base64Content,
    fileType: INHERITANCE_PLAN_FILETYPE,
  };
}

/**
 * Check whether a decrypted RawInstruction is an in-app inheritance plan
 * (as opposed to a user-uploaded file).
 */
export function isInheritancePlan(instruction: RawInstruction): boolean {
  return (
    instruction.fileName === INHERITANCE_PLAN_FILENAME &&
    instruction.fileType === INHERITANCE_PLAN_FILETYPE
  );
}

/**
 * Parse the base64 fileContent of a RawInstruction back into an
 * InheritancePlan object. Returns null if parsing or validation fails.
 * Handles migrations from v1/v2/v3/v4/v5 → v6.
 */
export function rawInstructionToPlan(instruction: RawInstruction): InheritancePlan | null {
  try {
    const bytes = Uint8Array.from(atob(instruction.fileContent), (c) => c.charCodeAt(0));
    const jsonString = new TextDecoder().decode(bytes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(jsonString);
    if (parsed && typeof parsed.version === 'number' && parsed.planInfo && parsed.digitalAssets) {
      // v1 → v2 migration: add deviceAccounts if missing
      if (!Array.isArray(parsed.deviceAccounts)) {
        parsed.deviceAccounts = [];
      }
      // v2/v3 → v4 migration: add beneficiaries, emergency access, plan version
      if (!Array.isArray(parsed.beneficiaries)) {
        parsed.beneficiaries = [];
        parsed.distributionInstructions = parsed.distributionInstructions ?? '';
      }
      if (!parsed.emergencyAccess) {
        parsed.emergencyAccess = { emergencyContact: '', triggerConditions: '', accessProcedure: '', immediateActions: '', scopeLimitations: '' };
      }
      if (parsed.planInfo && !('planVersion' in parsed.planInfo)) {
        parsed.planInfo.planVersion = '';
        parsed.planInfo.changeLog = '';
      }

      // v4 → v5 migration: add lastReviewedAt, defaulting to the most
      // reasonable existing timestamp on the plan so reconciliation with
      // the sidecar has something to anchor against.
      if (parsed.planInfo && !('lastReviewedAt' in parsed.planInfo)) {
        const today = new Date().toISOString().split('T')[0];
        parsed.planInfo.lastReviewedAt =
          parsed.planInfo.lastUpdated || parsed.planInfo.dateCreated || today;
      }

      // v2/v3 → v4 migration: merge recoveryCredentials + qardConfig into secretSets
      if (!Array.isArray(parsed.secretSets)) {
        const creds = parsed.recoveryCredentials ?? {};
        const qards = parsed.qardConfig ?? {};
        const migratedSet: SecretSet = {
          id: crypto.randomUUID(),
          description: '',
          password: creds.password ?? '',
          passwordIsHint: false,
          keyfileUsed: '',
          keyfilePrimaryLocation: creds.keyfilePrimaryLocation ?? '',
          keyfileBackupLocation: creds.keyfileBackupLocation ?? '',
          configuration: qards.configuration ?? '2-of-3',
          label: qards.label ?? '',
          qardLocations: Array.isArray(qards.locations) ? qards.locations : [],
          vaultFileLocation: qards.vaultFileLocation ?? '',
          smartCardPin: qards.smartCardPin ?? '',
          smartCardReaderModel: qards.smartCardReaderModel ?? '',
        };
        parsed.secretSets = [migratedSet];
        // Clean up old fields
        delete parsed.recoveryCredentials;
        delete parsed.qardConfig;
      }

      // v5 → v6 migration: password-hint flag, explicit keyfile usage, and
      // per-asset wallet-recovery fields. All default to "not specified" —
      // a legacy plan makes no claim either way.
      if (Array.isArray(parsed.secretSets)) {
        for (const set of parsed.secretSets) {
          if (typeof set.passwordIsHint !== 'boolean') set.passwordIsHint = false;
          if (typeof set.keyfileUsed !== 'string') set.keyfileUsed = '';
        }
      }
      if (Array.isArray(parsed.digitalAssets)) {
        for (const asset of parsed.digitalAssets) {
          if (typeof asset.walletKind !== 'string') asset.walletKind = '';
          if (typeof asset.usesPassphrase !== 'string') asset.usesPassphrase = '';
          if (typeof asset.derivationPath !== 'string') asset.derivationPath = '';
          if (typeof asset.multisigDescriptorLocation !== 'string') asset.multisigDescriptorLocation = '';
          if (typeof asset.multisigCosigners !== 'string') asset.multisigCosigners = '';
        }
      }

      parsed.version = INHERITANCE_PLAN_VERSION;
      return parsed as InheritancePlan;
    }
    return null;
  } catch {
    return null;
  }
}
