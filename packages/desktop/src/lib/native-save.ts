/**
 * Native "Save As" file dialog + write for Tauri v2 desktop.
 * Wraps @tauri-apps/plugin-dialog (save picker) and
 * @tauri-apps/plugin-fs (binary/text write).
 */
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

/** Filter definition for the save dialog. */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Show a native Save As dialog and write binary data to the chosen path.
 * Returns the chosen file path, or null if the user cancelled.
 */
export async function saveFileNative(
  defaultName: string,
  filters: FileFilter[],
  data: Uint8Array,
): Promise<string | null> {
  const filePath = await save({
    defaultPath: defaultName,
    filters,
  });

  if (!filePath) return null;

  await writeFile(filePath, data);
  return filePath;
}

/**
 * Show a native Save As dialog and write text data to the chosen path.
 * Returns the chosen file path, or null if the user cancelled.
 */
export async function saveTextFileNative(
  defaultName: string,
  filters: FileFilter[],
  text: string,
): Promise<string | null> {
  const filePath = await save({
    defaultPath: defaultName,
    filters,
  });

  if (!filePath) return null;

  await writeTextFile(filePath, text);
  return filePath;
}

/**
 * Basename of a path returned by the save dialog, for "Saved <name>" toasts —
 * the user may have renamed the file, so never echo the suggested default.
 * Handles both / and \ separators (macOS/Linux and Windows builds).
 */
export function savedFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// ── Data conversion helpers ────────────────────────────────────────────

/** Convert a canvas data URL (e.g. "data:image/png;base64,...") to Uint8Array. */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Convert a base64 string to Uint8Array. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ── Predefined filter sets ─────────────────────────────────────────────

export const PNG_FILTERS: FileFilter[] = [
  { name: 'PNG Images', extensions: ['png'] },
];

export const TXT_FILTERS: FileFilter[] = [
  { name: 'Text Files', extensions: ['txt'] },
];

export const ZIP_FILTERS: FileFilter[] = [
  { name: 'ZIP Archives', extensions: ['zip'] },
];

export const SEQRETS_FILTERS: FileFilter[] = [
  { name: 'seQRets Vault Files', extensions: ['seqrets'] },
];

export const BIN_FILTERS: FileFilter[] = [
  { name: 'Binary Files', extensions: ['bin'] },
];

export const PDF_FILTERS: FileFilter[] = [
  { name: 'PDF Documents', extensions: ['pdf'] },
];

export const ALL_FILES_FILTER: FileFilter[] = [
  { name: 'All Files', extensions: ['*'] },
];
