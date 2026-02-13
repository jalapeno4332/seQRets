//! PC/SC smartcard communication for seQRets.
//!
//! Provides Tauri commands for reading/writing Shamir shares and vault data
//! to/from JavaCard smartcards via the seQRets applet (AID: F0 53 51 52 54 53 01 00 00).
//!
//! Supports multi-item storage: multiple items (shares, vaults, instructions)
//! are serialized as a JSON array and stored in the card's single data slot.

use pcsc::*;
use serde::{Deserialize, Serialize};

// ── Constants ───────────────────────────────────────────────────────────

/// seQRets applet AID (Application Identifier)
const SEQRETS_AID: &[u8] = &[0xF0, 0x53, 0x51, 0x52, 0x54, 0x53, 0x01, 0x00, 0x00];

/// Proprietary CLA byte
const CLA: u8 = 0x80;

/// APDU instruction codes — must match SeQRetsApplet.java
const INS_STORE_DATA: u8 = 0x01;
const INS_READ_DATA: u8 = 0x02;
const INS_GET_STATUS: u8 = 0x03;
const INS_ERASE_DATA: u8 = 0x04;
const INS_SET_TYPE: u8 = 0x10;
const INS_SET_LABEL: u8 = 0x11;
const INS_VERIFY_PIN: u8 = 0x20;
const INS_CHANGE_PIN: u8 = 0x21;
const INS_SET_PIN: u8 = 0x22;

/// Maximum bytes per APDU data field
const CHUNK_SIZE: usize = 240;

/// Data type constants
const TYPE_SHARE: u8 = 0x01;
const TYPE_VAULT: u8 = 0x02;
const TYPE_MULTI: u8 = 0x03;

/// Approximate usable card capacity in bytes
const CARD_CAPACITY: usize = 8192;

// ── Serde types for frontend ────────────────────────────────────────────

/// A single item stored on the card.
#[derive(Serialize, Deserialize, Clone)]
pub struct CardItem {
    pub item_type: String,
    pub label: String,
    pub data: String,
}

/// Summary of an item (without full data) for status display.
#[derive(Serialize, Clone)]
pub struct CardItemSummary {
    pub index: usize,
    pub item_type: String,
    pub label: String,
    pub data_size: usize,
}

/// Multi-item card status returned to the frontend.
#[derive(Serialize, Clone)]
pub struct CardStatus {
    pub has_data: bool,
    pub data_length: u16,
    pub total_items: usize,
    pub items: Vec<CardItemSummary>,
    pub pin_set: bool,
    pub pin_verified: bool,
    pub free_bytes_estimate: i32,
}

// ── Helper functions ────────────────────────────────────────────────────

/// Send a raw APDU and return the response data (without SW1/SW2).
/// Returns an error if SW != 0x9000.
fn send_apdu(card: &Card, cla: u8, ins: u8, p1: u8, p2: u8, data: &[u8]) -> Result<Vec<u8>, String> {
    // Build command APDU
    let mut cmd = vec![cla, ins, p1, p2];

    if !data.is_empty() {
        cmd.push(data.len() as u8); // Lc
        cmd.extend_from_slice(data);
    }

    let mut resp_buf = [0u8; 258]; // max short APDU response
    let resp = card
        .transmit(&cmd, &mut resp_buf)
        .map_err(|e| format!("APDU transmit failed: {}", e))?;

    if resp.len() < 2 {
        return Err("Response too short".to_string());
    }

    let sw1 = resp[resp.len() - 2];
    let sw2 = resp[resp.len() - 1];
    let data_resp = &resp[..resp.len() - 2];

    if sw1 == 0x90 && sw2 == 0x00 {
        Ok(data_resp.to_vec())
    } else if sw1 == 0x69 && sw2 == 0x82 {
        Err("PIN verification required. Please verify your PIN first.".to_string())
    } else if sw1 == 0x69 && sw2 == 0x84 {
        Err("Card is locked. Too many incorrect PIN attempts.".to_string())
    } else if sw1 == 0x6A && sw2 == 0x84 {
        Err("Card storage full. Data too large for this card.".to_string())
    } else {
        Err(format!("Card returned error: SW={:02X}{:02X}", sw1, sw2))
    }
}

/// Send a SELECT APDU to activate the seQRets applet on the card.
fn select_applet(card: &Card) -> Result<(), String> {
    // SELECT command: CLA=0x00, INS=0xA4, P1=0x04 (by DF name), P2=0x00
    let mut cmd = vec![0x00, 0xA4, 0x04, 0x00];
    cmd.push(SEQRETS_AID.len() as u8);
    cmd.extend_from_slice(SEQRETS_AID);

    let mut resp_buf = [0u8; 258];
    let resp = card
        .transmit(&cmd, &mut resp_buf)
        .map_err(|e| format!("SELECT failed: {}", e))?;

    if resp.len() < 2 {
        return Err("SELECT response too short".to_string());
    }

    let sw1 = resp[resp.len() - 2];
    let sw2 = resp[resp.len() - 1];

    if sw1 == 0x90 && sw2 == 0x00 {
        Ok(())
    } else if sw1 == 0x6A && sw2 == 0x82 {
        Err("seQRets applet not found on this card. Please install the applet first.".to_string())
    } else {
        Err(format!("SELECT failed: SW={:02X}{:02X}", sw1, sw2))
    }
}

/// Connect to a specific reader and return a Card handle.
fn connect_reader(reader_name: &str) -> Result<(Context, Card), String> {
    let ctx = Context::establish(Scope::User)
        .map_err(|e| format!("Cannot access smart card system: {}", e))?;

    let card = ctx
        .connect(
            &std::ffi::CString::new(reader_name).map_err(|_| "Invalid reader name")?,
            ShareMode::Shared,
            Protocols::ANY,
        )
        .map_err(|e| format!("Cannot connect to card in '{}': {}", reader_name, e))?;

    Ok((ctx, card))
}

/// Explicitly disconnect the card with a reset disposition.
/// This forces the PC/SC subsystem to clear the session state,
/// preventing stale connections when the same reader is used again.
fn disconnect_with_reset(card: Card) {
    let _ = card.disconnect(Disposition::ResetCard);
}

/// If a PIN is provided, verify it on the current connection.
/// This must be called in the same connection as the protected operation
/// because PIN verification state is transient (cleared on applet re-select).
fn verify_pin_if_needed(card: &Card, pin: &Option<String>) -> Result<(), String> {
    if let Some(ref p) = pin {
        if !p.is_empty() {
            send_apdu(card, CLA, INS_VERIFY_PIN, 0x00, 0x00, p.as_bytes())?;
        }
    }
    Ok(())
}

/// Write a data blob to the card in chunks, with type and label metadata.
fn write_data_to_card(
    card: &Card,
    data: &[u8],
    data_type: u8,
    label_str: &str,
) -> Result<(), String> {
    // Step 1: Erase existing data
    send_apdu(card, CLA, INS_ERASE_DATA, 0x00, 0x00, &[])?;

    // Step 2: Set data type
    send_apdu(card, CLA, INS_SET_TYPE, data_type, 0x00, &[])?;

    // Step 3: Set label
    let label_bytes = label_str.as_bytes();
    let label_to_send = if label_bytes.len() > 64 {
        &label_bytes[..64]
    } else {
        label_bytes
    };
    if !label_to_send.is_empty() {
        send_apdu(card, CLA, INS_SET_LABEL, 0x00, 0x00, label_to_send)?;
    }

    // Step 4: Write data in chunks
    let chunks: Vec<&[u8]> = data.chunks(CHUNK_SIZE).collect();
    let num_chunks = chunks.len();

    for (i, chunk) in chunks.iter().enumerate() {
        let p1 = i as u8; // chunk index
        let p2 = if i == num_chunks - 1 { 0x01 } else { 0x00 }; // last chunk flag
        send_apdu(card, CLA, INS_STORE_DATA, p1, p2, chunk)?;
    }

    Ok(())
}

/// Read the raw data bytes from the card.
/// Returns (raw_data_bytes, type_byte, label_string).
/// Must be called after select_applet and verify_pin_if_needed.
fn read_raw_card_data(card: &Card) -> Result<(Vec<u8>, u8, String), String> {
    let status_resp = send_apdu(card, CLA, INS_GET_STATUS, 0x00, 0x00, &[])?;

    if status_resp.len() < 6 {
        return Err("Invalid status response".to_string());
    }

    let data_length = ((status_resp[0] as u16) << 8) | (status_resp[1] as u16);
    let data_type_byte = status_resp[2];
    let label_length = status_resp[5] as usize;

    let label = if label_length > 0 && status_resp.len() >= 6 + label_length {
        String::from_utf8_lossy(&status_resp[6..6 + label_length]).to_string()
    } else {
        String::new()
    };

    if data_length == 0 {
        return Ok((Vec::new(), data_type_byte, label));
    }

    // Read data in chunks
    let mut all_data: Vec<u8> = Vec::with_capacity(data_length as usize);
    let mut chunk_index: u8 = 0;

    while all_data.len() < data_length as usize {
        let chunk = send_apdu(card, CLA, INS_READ_DATA, chunk_index, 0x00, &[])?;
        if chunk.is_empty() {
            break;
        }
        all_data.extend_from_slice(&chunk);
        chunk_index += 1;

        // Safety check to prevent infinite loop
        if chunk_index > 100 {
            return Err("Too many chunks — data may be corrupted".to_string());
        }
    }

    all_data.truncate(data_length as usize);
    Ok((all_data, data_type_byte, label))
}

/// Parse card data into a list of CardItem, handling both legacy
/// single-item format and new multi-item JSON array format.
fn parse_card_items(raw_data: &[u8], type_byte: u8, label: &str) -> Result<Vec<CardItem>, String> {
    if raw_data.is_empty() {
        return Ok(Vec::new());
    }

    let data_string = String::from_utf8(raw_data.to_vec())
        .map_err(|_| "Card data is not valid UTF-8".to_string())?;

    if type_byte == TYPE_MULTI {
        // Multi-item format: JSON array of CardItem
        let items: Vec<CardItem> = serde_json::from_str(&data_string)
            .map_err(|e| format!("Failed to parse multi-item data: {}", e))?;
        Ok(items)
    } else {
        // Legacy single-item format: wrap in a Vec
        let item_type = match type_byte {
            TYPE_SHARE => "share".to_string(),
            TYPE_VAULT => "vault".to_string(),
            _ => "unknown".to_string(),
        };
        Ok(vec![CardItem {
            item_type,
            label: label.to_string(),
            data: data_string,
        }])
    }
}

/// Serialize a list of CardItem to JSON, then write to card as TYPE_MULTI.
fn write_items_to_card(card: &Card, items: &[CardItem]) -> Result<(), String> {
    let json = serde_json::to_string(items)
        .map_err(|e| format!("Failed to serialize items: {}", e))?;
    let data_bytes = json.as_bytes();

    // Size check
    if data_bytes.len() > CARD_CAPACITY {
        return Err(format!(
            "Combined data ({} bytes) exceeds card capacity (~{} bytes). Remove some items first.",
            data_bytes.len(),
            CARD_CAPACITY
        ));
    }

    let summary_label = format!(
        "{} item{}",
        items.len(),
        if items.len() == 1 { "" } else { "s" }
    );
    write_data_to_card(card, data_bytes, TYPE_MULTI, &summary_label)
}

// ── Tauri commands ──────────────────────────────────────────────────────

/// List all available PC/SC readers.
#[tauri::command]
pub fn list_readers() -> Result<Vec<String>, String> {
    let ctx = Context::establish(Scope::User)
        .map_err(|e| format!("Cannot access smart card system: {}", e))?;

    let mut readers_buf = [0u8; 4096];
    let readers = ctx
        .list_readers(&mut readers_buf)
        .map_err(|e| format!("Cannot list readers: {}", e))?;

    let result: Vec<String> = readers
        .map(|r| r.to_str().unwrap_or("Unknown reader").to_string())
        .collect();

    if result.is_empty() {
        Err("No smart card readers detected. Please connect a reader.".to_string())
    } else {
        Ok(result)
    }
}

/// Get the status of the card in the given reader, including item summaries.
#[tauri::command]
pub fn get_card_status(reader: String, pin: Option<String>) -> Result<CardStatus, String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;

    let resp = send_apdu(&card, CLA, INS_GET_STATUS, 0x00, 0x00, &[])?;

    if resp.len() < 6 {
        disconnect_with_reset(card);
        return Err("Invalid status response from card".to_string());
    }

    let data_length = ((resp[0] as u16) << 8) | (resp[1] as u16);
    let data_type_byte = resp[2];
    let pin_set = resp[3] == 0x01;
    let pin_verified = resp[4] == 0x01;
    let label_length = resp[5] as usize;

    let label = if label_length > 0 && resp.len() >= 6 + label_length {
        String::from_utf8_lossy(&resp[6..6 + label_length]).to_string()
    } else {
        String::new()
    };

    // If there's data, read and parse to get item summaries
    let (total_items, items) = if data_length > 0 {
        match read_raw_card_data(&card) {
            Ok((raw_data, type_byte, raw_label)) => {
                match parse_card_items(&raw_data, type_byte, &raw_label) {
                    Ok(parsed_items) => {
                        let summaries: Vec<CardItemSummary> = parsed_items
                            .iter()
                            .enumerate()
                            .map(|(i, item)| CardItemSummary {
                                index: i,
                                item_type: item.item_type.clone(),
                                label: item.label.clone(),
                                data_size: item.data.len(),
                            })
                            .collect();
                        (summaries.len(), summaries)
                    }
                    Err(_) => {
                        // Parse failed — show as single unknown item
                        let fallback_type = match data_type_byte {
                            TYPE_SHARE => "share".to_string(),
                            TYPE_VAULT => "vault".to_string(),
                            _ => "unknown".to_string(),
                        };
                        (
                            1,
                            vec![CardItemSummary {
                                index: 0,
                                item_type: fallback_type,
                                label: label.clone(),
                                data_size: data_length as usize,
                            }],
                        )
                    }
                }
            }
            Err(_) => {
                // Read failed — show minimal status from the status response
                let fallback_type = match data_type_byte {
                    TYPE_SHARE => "share".to_string(),
                    TYPE_VAULT => "vault".to_string(),
                    _ => "unknown".to_string(),
                };
                (
                    1,
                    vec![CardItemSummary {
                        index: 0,
                        item_type: fallback_type,
                        label: label.clone(),
                        data_size: data_length as usize,
                    }],
                )
            }
        }
    } else {
        (0, Vec::new())
    };

    let free_bytes_estimate = CARD_CAPACITY as i32 - data_length as i32;

    disconnect_with_reset(card);

    Ok(CardStatus {
        has_data: data_length > 0,
        data_length,
        total_items,
        items,
        pin_set,
        pin_verified,
        free_bytes_estimate,
    })
}

/// Write an item to the card, appending to any existing items.
/// Reads existing items, appends the new one, erases, and writes the combined data.
#[tauri::command]
pub fn write_item_to_card(
    reader: String,
    item_type: String,
    data: String,
    label: String,
    pin: Option<String>,
) -> Result<(), String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;

    // Read existing items (if any)
    let (raw_data, type_byte, existing_label) = read_raw_card_data(&card)?;
    let mut items = if raw_data.is_empty() {
        Vec::new()
    } else {
        parse_card_items(&raw_data, type_byte, &existing_label)?
    };

    // Append the new item
    items.push(CardItem {
        item_type,
        label,
        data,
    });

    // Write combined items (internally erases first)
    let result = write_items_to_card(&card, &items);
    disconnect_with_reset(card);
    result
}

/// Read all items from the card.
#[tauri::command]
pub fn read_card_items(reader: String, pin: Option<String>) -> Result<Vec<CardItem>, String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;

    let (raw_data, type_byte, label) = read_raw_card_data(&card)?;

    if raw_data.is_empty() {
        disconnect_with_reset(card);
        return Err("No data stored on this card.".to_string());
    }

    let items = parse_card_items(&raw_data, type_byte, &label);
    disconnect_with_reset(card);
    items
}

/// Read a single item by index from the card.
#[tauri::command]
pub fn read_card_item(
    reader: String,
    index: usize,
    pin: Option<String>,
) -> Result<CardItem, String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;

    let (raw_data, type_byte, label) = read_raw_card_data(&card)?;

    if raw_data.is_empty() {
        disconnect_with_reset(card);
        return Err("No data stored on this card.".to_string());
    }

    let items = parse_card_items(&raw_data, type_byte, &label)?;
    disconnect_with_reset(card);

    items
        .get(index)
        .cloned()
        .ok_or_else(|| format!("Item index {} out of range (card has {} items)", index, items.len()))
}

/// Delete a single item by index, rewriting the remaining items.
#[tauri::command]
pub fn delete_card_item(
    reader: String,
    index: usize,
    pin: Option<String>,
) -> Result<(), String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;

    let (raw_data, type_byte, label) = read_raw_card_data(&card)?;

    if raw_data.is_empty() {
        disconnect_with_reset(card);
        return Err("No data stored on this card.".to_string());
    }

    let mut items = parse_card_items(&raw_data, type_byte, &label)?;

    if index >= items.len() {
        disconnect_with_reset(card);
        return Err(format!(
            "Item index {} out of range (card has {} items)",
            index,
            items.len()
        ));
    }

    items.remove(index);

    let result = if items.is_empty() {
        // No items left — just erase the card
        send_apdu(&card, CLA, INS_ERASE_DATA, 0x00, 0x00, &[]).map(|_| ())
    } else {
        write_items_to_card(&card, &items)
    };

    disconnect_with_reset(card);
    result
}

/// Erase all data from the card.
#[tauri::command]
pub fn erase_card(reader: String, pin: Option<String>) -> Result<(), String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;
    let result = send_apdu(&card, CLA, INS_ERASE_DATA, 0x00, 0x00, &[]);
    disconnect_with_reset(card);
    result.map(|_| ())
}

/// Verify the PIN on the card.
#[tauri::command]
pub fn verify_pin(reader: String, pin: String) -> Result<(), String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    let result = send_apdu(&card, CLA, INS_VERIFY_PIN, 0x00, 0x00, pin.as_bytes());
    disconnect_with_reset(card);
    result.map(|_| ())
}

/// Set initial PIN on the card (only works if no PIN is set).
#[tauri::command]
pub fn set_pin(reader: String, pin: String) -> Result<(), String> {
    let pin_bytes = pin.as_bytes();
    if pin_bytes.len() < 8 || pin_bytes.len() > 16 {
        return Err("PIN must be 8-16 characters.".to_string());
    }

    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    let result = send_apdu(&card, CLA, INS_SET_PIN, 0x00, 0x00, pin_bytes);
    disconnect_with_reset(card);
    result.map(|_| ())
}

/// Change the PIN on the card (must be verified first).
#[tauri::command]
pub fn change_pin(reader: String, old_pin: String, new_pin: String) -> Result<(), String> {
    let new_pin_bytes = new_pin.as_bytes();
    if new_pin_bytes.len() < 8 || new_pin_bytes.len() > 16 {
        return Err("New PIN must be 8-16 characters.".to_string());
    }

    let old_pin_bytes = old_pin.as_bytes();
    let mut data = Vec::with_capacity(old_pin_bytes.len() + new_pin_bytes.len());
    data.extend_from_slice(old_pin_bytes);
    data.extend_from_slice(new_pin_bytes);

    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    let result = send_apdu(
        &card,
        CLA,
        INS_CHANGE_PIN,
        old_pin_bytes.len() as u8,
        0x00,
        &data,
    );
    disconnect_with_reset(card);
    result.map(|_| ())
}
