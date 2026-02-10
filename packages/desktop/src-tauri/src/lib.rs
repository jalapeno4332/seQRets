mod smartcard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
      smartcard::list_readers,
      smartcard::get_card_status,
      smartcard::write_share_to_card,
      smartcard::write_vault_to_card,
      smartcard::read_card,
      smartcard::erase_card,
      smartcard::verify_pin,
      smartcard::set_pin,
      smartcard::change_pin,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
