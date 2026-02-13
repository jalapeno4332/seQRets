//! PC/SC smartcard communication for seQRets.
//!
//! Provides Tauri commands for reading/writing Shamir shares and vault data
//! to/from JavaCard smartcards via the seQRets applet (AID: F0 53 51 52 54 53 01 00 00).

use pcsc::*;
use serde::Serialize;

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

// ── Serde types for frontend ────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct CardStatus {
    pub has_data: bool,
    pub data_length: u16,
    pub data_type: String,
    pub label: String,
    pub pin_set: bool,
    pub pin_verified: bool,
}

#[derive(Serialize, Clone)]
pub struct CardData {
    pub data: String,
    pub data_type: String,
    pub label: String,
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

/// Get the status of the card in the given reader.
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

    let data_type = match data_type_byte {
        0x01 => "share".to_string(),
        0x02 => "vault".to_string(),
        _ => "empty".to_string(),
    };

    disconnect_with_reset(card);

    Ok(CardStatus {
        has_data: data_length > 0,
        data_length,
        data_type,
        label,
        pin_set,
        pin_verified,
    })
}

/// Write a single Shamir share to the card.
#[tauri::command]
pub fn write_share_to_card(reader: String, share: String, label: String, pin: Option<String>) -> Result<(), String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;
    let result = write_data_to_card(&card, share.as_bytes(), TYPE_SHARE, &label);
    disconnect_with_reset(card);
    result
}

/// Write vault JSON data to the card.
#[tauri::command]
pub fn write_vault_to_card(
    reader: String,
    vault_json: String,
    label: String,
    pin: Option<String>,
) -> Result<(), String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;
    let result = write_data_to_card(&card, vault_json.as_bytes(), TYPE_VAULT, &label);
    disconnect_with_reset(card);
    result
}

/// Read data from the card (share or vault).
#[tauri::command]
pub fn read_card(reader: String, pin: Option<String>) -> Result<CardData, String> {
    let (_ctx, card) = connect_reader(&reader)?;
    select_applet(&card)?;
    verify_pin_if_needed(&card, &pin)?;

    // Get status first to know how much data to read
    let status_resp = send_apdu(&card, CLA, INS_GET_STATUS, 0x00, 0x00, &[])?;

    if status_resp.len() < 6 {
        disconnect_with_reset(card);
        return Err("Invalid status response".to_string());
    }

    let data_length = ((status_resp[0] as u16) << 8) | (status_resp[1] as u16);
    let data_type_byte = status_resp[2];
    let label_length = status_resp[5] as usize;

    if data_length == 0 {
        disconnect_with_reset(card);
        return Err("No data stored on this card.".to_string());
    }

    let label = if label_length > 0 && status_resp.len() >= 6 + label_length {
        String::from_utf8_lossy(&status_resp[6..6 + label_length]).to_string()
    } else {
        String::new()
    };

    let data_type = match data_type_byte {
        0x01 => "share".to_string(),
        0x02 => "vault".to_string(),
        _ => "unknown".to_string(),
    };

    // Read data in chunks
    let mut all_data: Vec<u8> = Vec::with_capacity(data_length as usize);
    let mut chunk_index: u8 = 0;

    while all_data.len() < data_length as usize {
        let chunk = send_apdu(&card, CLA, INS_READ_DATA, chunk_index, 0x00, &[])?;

        if chunk.is_empty() {
            break;
        }

        all_data.extend_from_slice(&chunk);
        chunk_index += 1;

        // Safety check to prevent infinite loop
        if chunk_index > 100 {
            disconnect_with_reset(card);
            return Err("Too many chunks — data may be corrupted".to_string());
        }
    }

    // Trim to exact length
    all_data.truncate(data_length as usize);

    let data_string = match String::from_utf8(all_data) {
        Ok(s) => s,
        Err(_) => {
            disconnect_with_reset(card);
            return Err("Card data is not valid UTF-8".to_string());
        }
    };

    disconnect_with_reset(card);

    Ok(CardData {
        data: data_string,
        data_type,
        label,
    })
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
