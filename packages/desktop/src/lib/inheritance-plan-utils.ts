import type { InheritancePlan } from './inheritance-plan-types';
import { INHERITANCE_PLAN_FILENAME, INHERITANCE_PLAN_FILETYPE } from './inheritance-plan-types';
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
 */
export function rawInstructionToPlan(instruction: RawInstruction): InheritancePlan | null {
  try {
    const bytes = Uint8Array.from(atob(instruction.fileContent), (c) => c.charCodeAt(0));
    const jsonString = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed.version === 'number' && parsed.planInfo && parsed.digitalAssets) {
      return parsed as InheritancePlan;
    }
    return null;
  } catch {
    return null;
  }
}
