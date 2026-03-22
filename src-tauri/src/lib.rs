mod config;
mod favorites;
mod reddit;
mod saved;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;

use reddit::client::{build_client, fetch_listing, resolve_redgifs};
use reddit::parser::parse_listing;
use reddit::types::{FetchParams, FetchResult, MediaPost};
use percent_encoding::percent_decode_str;
use tauri::Manager;
use tauri::http::{Response as HttpResponse, StatusCode};

pub struct AppState {
    pub client: reqwest::Client,
    pub favorites_path: PathBuf,
    pub favorites: Mutex<Vec<String>>,
    pub video_cache: Mutex<HashMap<String, CachedVideo>>,
    pub config_path: PathBuf,
    pub save_path: Mutex<PathBuf>,
    pub saved_ids: Mutex<HashSet<String>>,
}

pub struct CachedVideo {
    bytes: Vec<u8>,
    content_type: String,
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

    let mut result = parse_listing(&listing);
    resolve_redgifs(&state.client, &mut result.posts).await;
    Ok(result)
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

#[tauri::command]
async fn preload_video(
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    let real_url = if let Some(encoded) = url.strip_prefix("http://media-proxy.localhost/") {
        percent_decode_str(encoded).decode_utf8_lossy().to_string()
    } else {
        url.clone()
    };

    {
        let cache = state.video_cache.lock().map_err(|e| e.to_string())?;
        if cache.contains_key(&real_url) {
            return Ok(());
        }
    }

    eprintln!("[preload] Downloading: {}", real_url);
    let resp = state.client.get(&real_url).send().await.map_err(|e| e.to_string())?;
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("video/mp4")
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
    eprintln!("[preload] Cached {} bytes for: {}", bytes.len(), real_url);

    let mut cache = state.video_cache.lock().map_err(|e| e.to_string())?;
    if cache.len() >= 10 {
        cache.clear();
    }
    cache.insert(real_url, CachedVideo { bytes, content_type });
    Ok(())
}

#[tauri::command]
fn log_frontend(level: String, msg: String) {
    eprintln!("[frontend][{}] {}", level, msg);
}

// --- Saved posts commands ---

#[tauri::command]
async fn save_post(
    state: tauri::State<'_, AppState>,
    post: MediaPost,
) -> Result<saved::SavedPostMeta, String> {
    let save_path = state.save_path.lock().map_err(|e| e.to_string())?.clone();
    let meta = saved::save_post(&state.client, &save_path, &post).await?;
    let mut ids = state.saved_ids.lock().map_err(|e| e.to_string())?;
    ids.insert(post.id);
    Ok(meta)
}

#[tauri::command]
async fn get_saved_posts(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<saved::SavedPostMeta>, String> {
    let save_path = state.save_path.lock().map_err(|e| e.to_string())?.clone();
    saved::list_saved_posts(&save_path)
}

#[tauri::command]
async fn delete_saved_post(
    state: tauri::State<'_, AppState>,
    subreddit: String,
    post_id: String,
) -> Result<(), String> {
    let save_path = state.save_path.lock().map_err(|e| e.to_string())?.clone();
    saved::delete_saved_post(&save_path, &subreddit, &post_id)?;
    let mut ids = state.saved_ids.lock().map_err(|e| e.to_string())?;
    ids.remove(&post_id);
    Ok(())
}

#[tauri::command]
async fn is_post_saved(
    state: tauri::State<'_, AppState>,
    post_id: String,
) -> Result<bool, String> {
    let ids = state.saved_ids.lock().map_err(|e| e.to_string())?;
    Ok(ids.contains(&post_id))
}

#[tauri::command]
async fn get_save_path(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let path = state.save_path.lock().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_save_path(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let new_path = PathBuf::from(&path);
    let mut save_path = state.save_path.lock().map_err(|e| e.to_string())?;
    *save_path = new_path;

    // Update config
    let mut cfg = config::read_config(&state.config_path);
    cfg.save_path = Some(path);
    config::write_config(&state.config_path, &cfg)?;

    // Reload saved IDs from new path
    let new_ids = saved::load_saved_ids(&save_path);
    let mut ids = state.saved_ids.lock().map_err(|e| e.to_string())?;
    *ids = new_ids;

    Ok(())
}

#[tauri::command]
async fn open_save_folder(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = state.save_path.lock().map_err(|e| e.to_string())?.clone();
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn serve_bytes(bytes: &[u8], content_type: &str, range: &Option<String>) -> HttpResponse<Vec<u8>> {
    let total = bytes.len();
    if let Some(range_str) = range {
        if let Some(range_val) = range_str.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_val.splitn(2, '-').collect();
            let start: usize = parts[0].parse().unwrap_or(0);
            let end: usize = if parts.len() > 1 && !parts[1].is_empty() {
                parts[1].parse().unwrap_or(total - 1)
            } else {
                total - 1
            };
            let end = end.min(total - 1);
            let slice = &bytes[start..=end];
            return HttpResponse::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Type", content_type)
                .header("Accept-Ranges", "bytes")
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, total))
                .header("Content-Length", slice.len().to_string())
                .body(slice.to_vec())
                .unwrap();
        }
    }
    HttpResponse::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", total.to_string())
        .body(bytes.to_vec())
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("media-proxy", |ctx, request, responder| {
            let app_handle = ctx.app_handle().clone();
            let range_header = request.headers().get("range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
            tauri::async_runtime::spawn(async move {
                let uri = request.uri().to_string();
                let encoded_url = uri
                    .strip_prefix("http://media-proxy.localhost/")
                    .or_else(|| uri.strip_prefix("https://media-proxy.localhost/"))
                    .or_else(|| uri.strip_prefix("media-proxy://localhost/"))
                    .unwrap_or("");
                let video_url = percent_decode_str(encoded_url).decode_utf8_lossy().to_string();
                eprintln!("[media-proxy] Request: {} -> {} (range: {:?})", uri, video_url, range_header);

                if video_url.is_empty() {
                    responder.respond(
                        HttpResponse::builder()
                            .status(StatusCode::BAD_REQUEST)
                            .body(b"Empty URL".to_vec())
                            .unwrap(),
                    );
                    return;
                }

                let state = app_handle.state::<AppState>();

                // Check video cache first
                {
                    let cache = state.video_cache.lock().unwrap();
                    if let Some(cached) = cache.get(&video_url) {
                        eprintln!("[media-proxy] Serving from cache: {} ({} bytes)", video_url, cached.bytes.len());
                        responder.respond(serve_bytes(&cached.bytes, &cached.content_type, &range_header));
                        return;
                    }
                }

                match state.client.get(&video_url).send().await {
                    Ok(resp) => {
                        let content_type = resp
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("video/mp4")
                            .to_string();
                        let content_length = resp.content_length().unwrap_or(0);
                        eprintln!("[media-proxy] Response: {} bytes content-type={}", content_length, content_type);
                        match resp.bytes().await {
                            Ok(bytes) => {
                                eprintln!("[media-proxy] Serving {} bytes", bytes.len());
                                let bytes_vec = bytes.to_vec();
                                let response = serve_bytes(&bytes_vec, &content_type, &range_header);

                                if let Ok(mut cache) = state.video_cache.lock() {
                                    if cache.len() >= 10 {
                                        cache.clear();
                                    }
                                    cache.insert(video_url, CachedVideo { bytes: bytes_vec, content_type });
                                }

                                responder.respond(response);
                            }
                            Err(e) => {
                                eprintln!("[media-proxy] Body read error: {}", e);
                                responder.respond(
                                    HttpResponse::builder()
                                        .status(StatusCode::BAD_GATEWAY)
                                        .body(format!("Body read error: {}", e).into_bytes())
                                        .unwrap(),
                                );
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[media-proxy] Fetch error: {}", e);
                        responder.respond(
                            HttpResponse::builder()
                                .status(StatusCode::BAD_GATEWAY)
                                .body(format!("Fetch error: {}", e).into_bytes())
                                .unwrap(),
                        );
                    }
                }
            });
        })
        .register_asynchronous_uri_scheme_protocol("saved-media", |ctx, request, responder| {
            let app_handle = ctx.app_handle().clone();
            let range_header = request.headers().get("range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
            tauri::async_runtime::spawn(async move {
                let uri = request.uri().to_string();
                // URL format: http://saved-media.localhost/{subreddit}/{filename}
                let path_part = uri
                    .strip_prefix("http://saved-media.localhost/")
                    .or_else(|| uri.strip_prefix("https://saved-media.localhost/"))
                    .or_else(|| uri.strip_prefix("saved-media://localhost/"))
                    .unwrap_or("");
                let decoded_path = percent_decode_str(path_part).decode_utf8_lossy().to_string();
                eprintln!("[saved-media] Request: {} -> {}", uri, decoded_path);

                if decoded_path.is_empty() {
                    responder.respond(
                        HttpResponse::builder()
                            .status(StatusCode::BAD_REQUEST)
                            .body(b"Empty path".to_vec())
                            .unwrap(),
                    );
                    return;
                }

                let state = app_handle.state::<AppState>();
                let save_path = state.save_path.lock().unwrap().clone();
                let file_path = save_path.join(&decoded_path);

                // Security: ensure file_path is within save_path
                match file_path.canonicalize() {
                    Ok(canonical) => {
                        if let Ok(save_canonical) = save_path.canonicalize() {
                            if !canonical.starts_with(&save_canonical) {
                                responder.respond(
                                    HttpResponse::builder()
                                        .status(StatusCode::FORBIDDEN)
                                        .body(b"Access denied".to_vec())
                                        .unwrap(),
                                );
                                return;
                            }
                        }
                    }
                    Err(_) => {
                        responder.respond(
                            HttpResponse::builder()
                                .status(StatusCode::NOT_FOUND)
                                .body(b"File not found".to_vec())
                                .unwrap(),
                        );
                        return;
                    }
                }

                match std::fs::read(&file_path) {
                    Ok(bytes) => {
                        let ext = file_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("");
                        let content_type = match ext {
                            "jpg" | "jpeg" => "image/jpeg",
                            "png" => "image/png",
                            "gif" => "image/gif",
                            "webp" => "image/webp",
                            "mp4" => "video/mp4",
                            "webm" => "video/webm",
                            _ => "application/octet-stream",
                        };
                        responder.respond(serve_bytes(&bytes, content_type, &range_header));
                    }
                    Err(e) => {
                        eprintln!("[saved-media] Read error: {}", e);
                        responder.respond(
                            HttpResponse::builder()
                                .status(StatusCode::NOT_FOUND)
                                .body(format!("File not found: {}", e).into_bytes())
                                .unwrap(),
                        );
                    }
                }
            });
        })
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Debug)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Stderr,
                    ))
                    .build(),
            )?;

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let fav_path = favorites::favorites_path(&app_data_dir);
            let favs = favorites::read_favorites(&fav_path);

            let cfg_path = config::config_path(&app_data_dir);
            let cfg = config::read_config(&cfg_path);
            let save_path = config::resolve_save_path(&cfg, &app_data_dir);
            let saved_ids = saved::load_saved_ids(&save_path);

            app.manage(AppState {
                client: build_client(),
                favorites_path: fav_path,
                favorites: Mutex::new(favs),
                video_cache: Mutex::new(HashMap::new()),
                config_path: cfg_path,
                save_path: Mutex::new(save_path),
                saved_ids: Mutex::new(saved_ids),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_posts,
            get_favorites,
            add_favorite,
            remove_favorite,
            preload_video,
            log_frontend,
            save_post,
            get_saved_posts,
            delete_saved_post,
            is_post_saved,
            get_save_path,
            set_save_path,
            open_save_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
