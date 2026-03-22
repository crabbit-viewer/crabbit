mod favorites;
mod reddit;

use std::path::PathBuf;
use std::sync::Mutex;

use reddit::client::{build_client, fetch_listing};
use reddit::parser::parse_listing;
use reddit::types::{FetchParams, FetchResult};
use tauri::Manager;

pub struct AppState {
    pub client: reqwest::Client,
    pub favorites_path: PathBuf,
    pub favorites: Mutex<Vec<String>>,
}

#[tauri::command]
async fn fetch_posts(
    state: tauri::State<'_, AppState>,
    params: FetchParams,
) -> Result<FetchResult, String> {
    let sort = params.sort.as_deref().unwrap_or("hot");
    let time_range = params.time_range.as_deref().unwrap_or("day");
    let limit = params.limit.unwrap_or(25).min(100);

    let listing = fetch_listing(
        &state.client,
        &params.subreddit,
        sort,
        time_range,
        params.after.as_deref(),
        limit,
    )
    .await?;

    Ok(parse_listing(&listing))
}

#[tauri::command]
async fn get_favorites(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let favs = state.favorites.lock().map_err(|e| e.to_string())?;
    Ok(favs.clone())
}

#[tauri::command]
async fn add_favorite(
    state: tauri::State<'_, AppState>,
    subreddit: String,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().map_err(|e| e.to_string())?;
    let sub_lower = subreddit.to_lowercase();
    if !favs.iter().any(|f| f.to_lowercase() == sub_lower) {
        favs.push(subreddit);
        favorites::write_favorites(&state.favorites_path, &favs)?;
    }
    Ok(())
}

#[tauri::command]
async fn remove_favorite(
    state: tauri::State<'_, AppState>,
    subreddit: String,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().map_err(|e| e.to_string())?;
    let sub_lower = subreddit.to_lowercase();
    favs.retain(|f| f.to_lowercase() != sub_lower);
    favorites::write_favorites(&state.favorites_path, &favs)?;
    Ok(())
}

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

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let fav_path = favorites::favorites_path(&app_data_dir);
            let favs = favorites::read_favorites(&fav_path);

            app.manage(AppState {
                client: build_client(),
                favorites_path: fav_path,
                favorites: Mutex::new(favs),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_posts,
            get_favorites,
            add_favorite,
            remove_favorite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
