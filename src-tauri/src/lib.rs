mod favorites;
mod reddit;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use reddit::client::{build_client, fetch_listing, resolve_redgifs};
use reddit::parser::parse_listing;
use reddit::types::{FetchParams, FetchResult};
use percent_encoding::percent_decode_str;
use tauri::Manager;
use tauri::http::{Response as HttpResponse, StatusCode};

pub struct AppState {
    pub client: reqwest::Client,
    pub favorites_path: PathBuf,
    pub favorites: Mutex<Vec<String>>,
    pub video_cache: Mutex<HashMap<String, CachedVideo>>,
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
    // Extract the real URL from proxy URL format: http://media-proxy.localhost/<encoded_url>
    let real_url = if let Some(encoded) = url.strip_prefix("http://media-proxy.localhost/") {
        percent_decode_str(encoded).decode_utf8_lossy().to_string()
    } else {
        url.clone()
    };

    // Cache key is the real URL (same key media-proxy looks up)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("media-proxy", |ctx, request, responder| {
            let app_handle = ctx.app_handle().clone();
            let range_header = request.headers().get("range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
            tauri::async_runtime::spawn(async move {
                let uri = request.uri().to_string();
                // URL format: http://media-proxy.localhost/<percent_encoded_url>
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

                // Helper to serve bytes with range support
                let serve_bytes = |bytes: &[u8], content_type: &str, range: &Option<String>| -> HttpResponse<Vec<u8>> {
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
                            eprintln!("[media-proxy] Range {}-{}/{} ({} bytes)", start, end, total, slice.len());
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
                };

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

                                // Cache the fetched video
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

            app.manage(AppState {
                client: build_client(),
                favorites_path: fav_path,
                favorites: Mutex::new(favs),
                video_cache: Mutex::new(HashMap::new()),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
