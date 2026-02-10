/**
 * TypeScript wrapper for Tauri smartcard commands.
 * All functions invoke Rust backend commands via Tauri's IPC.
 */
import { invoke } from '@tauri-apps/api/core';

export interface CardStatus {
  has_data: boolean;
  data_length: number;
  data_type: string; // "share" | "vault" | "empty"
  label: string;
  pin_set: boolean;
  pin_verified: boolean;
}

export interface CardData {
  data: string;
  data_type: string; // "share" | "vault"
  label: string;
}

/** List all available PC/SC smart card readers. */
export const listReaders = () => invoke<string[]>('list_readers');

/** Get the status of the card in the specified reader. */
export const getCardStatus = (reader: string) =>
  invoke<CardStatus>('get_card_status', { reader });

/** Write a single Shamir share to the card. */
export const writeShareToCard = (reader: string, share: string, label: string) =>
  invoke<void>('write_share_to_card', { reader, share, label });

/** Write vault JSON data to the card. */
export const writeVaultToCard = (reader: string, vaultJson: string, label: string) =>
  invoke<void>('write_vault_to_card', { reader, vaultJson, label });

/** Read data (share or vault) from the card. */
export const readCard = (reader: string) =>
  invoke<CardData>('read_card', { reader });

/** Erase all data from the card. */
export const eraseCard = (reader: string) =>
  invoke<void>('erase_card', { reader });

/** Verify the PIN on the card. */
export const verifyPin = (reader: string, pin: string) =>
  invoke<void>('verify_pin', { reader, pin });

/** Set the initial PIN on the card (only works if no PIN is set). */
export const setPin = (reader: string, pin: string) =>
  invoke<void>('set_pin', { reader, pin });

/** Change the PIN on the card (must be verified first). */
export const changePin = (reader: string, oldPin: string, newPin: string) =>
  invoke<void>('change_pin', { reader, oldPin, newPin });
