/**
 * TypeScript wrapper for Tauri smartcard commands.
 * All functions invoke Rust backend commands via Tauri's IPC.
 *
 * Supports multi-item storage: multiple items (shares, vaults, instructions)
 * can be stored on a single card as a JSON array.
 */
import { invoke } from '@tauri-apps/api/core';

// ── Types ───────────────────────────────────────────────────────────────

/** A single item stored on the card. */
export interface CardItem {
  item_type: string; // "share" | "vault" | "instructions"
  label: string;
  data: string;
}

/** Summary of an item (without full data) for status display. */
export interface CardItemSummary {
  index: number;
  item_type: string;
  label: string;
  data_size: number;
}

/** Card status including multi-item information. */
export interface CardStatus {
  has_data: boolean;
  data_length: number;
  total_items: number;
  items: CardItemSummary[];
  pin_set: boolean;
  pin_verified: boolean;
  free_bytes_estimate: number;
}

// ── Reader operations ───────────────────────────────────────────────────

/** List all available PC/SC smart card readers. */
export const listReaders = () => invoke<string[]>('list_readers');

// ── Status ──────────────────────────────────────────────────────────────

/** Get the status of the card in the specified reader, including item summaries. */
export const getCardStatus = (reader: string, pin?: string | null) =>
  invoke<CardStatus>('get_card_status', { reader, pin: pin || null });

// ── Write operations ────────────────────────────────────────────────────

/** Write an item to the card, appending to existing items. */
export const writeItemToCard = (
  reader: string,
  itemType: string,
  data: string,
  label: string,
  pin?: string | null,
) => invoke<void>('write_item_to_card', { reader, itemType, data, label, pin: pin || null });

// ── Read operations ─────────────────────────────────────────────────────

/** Read all items from the card. */
export const readCardItems = (reader: string, pin?: string | null) =>
  invoke<CardItem[]>('read_card_items', { reader, pin: pin || null });

/** Read a single item by index from the card. */
export const readCardItem = (reader: string, index: number, pin?: string | null) =>
  invoke<CardItem>('read_card_item', { reader, index, pin: pin || null });

// ── Delete operations ───────────────────────────────────────────────────

/** Delete a single item by index (rewrites remaining items). */
export const deleteCardItem = (reader: string, index: number, pin?: string | null) =>
  invoke<void>('delete_card_item', { reader, index, pin: pin || null });

/** Erase all data from the card. */
export const eraseCard = (reader: string, pin?: string | null) =>
  invoke<void>('erase_card', { reader, pin: pin || null });

// ── PIN operations ──────────────────────────────────────────────────────

/** Verify the PIN on the card. */
export const verifyPin = (reader: string, pin: string) =>
  invoke<void>('verify_pin', { reader, pin });

/** Set the initial PIN on the card (only works if no PIN is set). */
export const setPin = (reader: string, pin: string) =>
  invoke<void>('set_pin', { reader, pin });

/** Change the PIN on the card (must be verified first). */
export const changePin = (reader: string, oldPin: string, newPin: string) =>
  invoke<void>('change_pin', { reader, oldPin, newPin });
