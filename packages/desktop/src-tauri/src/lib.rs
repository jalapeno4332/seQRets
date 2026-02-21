mod crypto;
mod smartcard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // Smartcard commands
      smartcard::list_readers,
      smartcard::get_card_status,
      smartcard::write_item_to_card,
      smartcard::read_card_items,
      smartcard::read_card_item,
      smartcard::delete_card_item,
      smartcard::erase_card,
      smartcard::force_erase_card,
      smartcard::verify_pin,
      smartcard::set_pin,
      smartcard::change_pin,
      // Native crypto commands (Argon2id + XChaCha20-Poly1305)
      crypto::crypto_create,
      crypto::crypto_restore,
      crypto::crypto_encrypt_blob,
      crypto::crypto_decrypt_blob,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
