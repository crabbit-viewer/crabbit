mod config;
mod favorites;
#[cfg(target_os = "linux")]
mod mpv_gtk;
#[cfg(target_os = "linux")]
mod mpvplayer;
mod reddit;
mod saved;
mod videoserver;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use log::{debug, error};
use reddit::client::{build_client, fetch_listing, resolve_redgifs};
use reddit::parser::parse_listing;
use reddit::types::{FetchParams, FetchResult, MediaPost};
use percent_encoding::percent_decode_str;
use sha2::{Sha256, Digest};
use tauri::Manager;
use tauri::http::{Response as HttpResponse, StatusCode};

pub struct AppState {
    pub client: reqwest::Client,
    pub favorites_path: PathBuf,
    pub favorites: Mutex<Vec<String>>,
    pub video_cache: videoserver::VideoCache,
    pub video_server_port: u16,
    pub config_path: PathBuf,
    pub save_path: Mutex<PathBuf>,
    pub saved_ids: Mutex<HashSet<String>>,
    #[cfg(target_os = "linux")]
    pub mpv_player: std::sync::Arc<Mutex<Option<mpvplayer::MpvPlayer>>>,
    /// Shared flag to control GLArea visibility from any thread.
    /// The GTK main loop timer reads this and shows/hides the GLArea.
    #[cfg(target_os = "linux")]
    pub mpv_visible: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

fn url_to_cache_key(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    hex::encode(hasher.finalize())
}

/// Decode a media-proxy URL back to the real URL, or return the original.
pub fn decode_proxy_url(url: &str) -> String {
    if let Some(encoded) = url.strip_prefix("media-proxy://localhost/").or_else(|| url.strip_prefix("http://media-proxy.localhost/")) {
        percent_decode_str(encoded).decode_utf8_lossy().to_string()
    } else {
        url.to_string()
    }
}


#[tauri::command]
async fn fetch_posts(
    state: tauri::State<'_, AppState>,
    params: FetchParams,
) -> Result<FetchResult, String> {
    let sort = params.sort.as_deref().unwrap_or("hot");
    let time_range = params.time_range.as_deref().unwrap_or("day");
    let limit = params.limit.unwrap_or(25).min(100);

    eprintln!("[fetch_posts] r/{} sort={} time={} limit={} after={:?}", params.subreddit, sort, time_range, limit, params.after);

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

    eprintln!("[fetch_posts] Returned {} posts, after={:?}", result.posts.len(), result.after);

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
) -> Result<String, String> {
    let real_url = decode_proxy_url(&url);
    let key = url_to_cache_key(&real_url);

    {
        let mut cache = state.video_cache.lock().await;
        if cache.entries.contains_key(&key) {
            cache.touch(&key);
            return Ok(key);
        }
        // Check if another task is already downloading this URL
        if !cache.inflight.insert(key.clone()) {
            eprintln!("[preload] Already downloading: {}", real_url);
            // Wait for the other download by polling the cache
            drop(cache);
            for _ in 0..300 { // up to 30 seconds
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                let cache = state.video_cache.lock().await;
                if cache.entries.contains_key(&key) {
                    return Ok(key);
                }
                if !cache.inflight.contains(&key) {
                    // Other download finished but entry got evicted or failed
                    break;
                }
            }
            return Err("Timed out waiting for in-flight download".to_string());
        }
    }

    eprintln!("[preload] Downloading: {}", real_url);
    let download = async {
        let resp = state.client.get(&real_url).send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS || status == reqwest::StatusCode::FORBIDDEN {
            return Err(format!("Rate limited ({}): {}", status, real_url));
        }
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("video/mp4")
            .to_string();
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
        eprintln!("[preload] Cached {} bytes (status={} type={}) for: {}", bytes.len(), status, content_type, real_url);
        Ok::<_, String>((bytes, content_type))
    };
    let result = match tokio::time::timeout(std::time::Duration::from_secs(30), download).await {
        Ok(r) => r,
        Err(_) => {
            eprintln!("[preload] TIMEOUT after 30s: {}", real_url);
            Err(format!("Download timed out: {}", real_url))
        }
    };

    let mut cache = state.video_cache.lock().await;
    cache.inflight.remove(&key);

    match result {
        Ok((bytes, content_type)) => {
            cache.insert(key.clone(), bytes, content_type);
            Ok(key)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn fetch_video_bytes(
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<tauri::ipc::Response, String> {
    let real_url = decode_proxy_url(&url);
    let key = url_to_cache_key(&real_url);

    {
        let mut cache = state.video_cache.lock().await;
        cache.touch(&key);
        if let Some(cached) = cache.entries.get(&key) {
            eprintln!("[fetch_video_bytes] Cache HIT: {} ({} bytes)", real_url, cached.bytes.len());
            return Ok(tauri::ipc::Response::new(cached.bytes.clone()));
        }
    }

    eprintln!("[fetch_video_bytes] Cache MISS, fetching: {}", real_url);
    let resp = state.client.get(&real_url).send().await.map_err(|e| {
        eprintln!("[fetch_video_bytes] Fetch error: {}", e);
        format!("Fetch error: {}", e)
    })?;
    let status = resp.status();
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("video/mp4")
        .to_string();
    if !status.is_success() {
        let msg = format!("Upstream returned {} for {}", status, real_url);
        eprintln!("[fetch_video_bytes] ERROR: {}", msg);
        return Err(msg);
    }
    let bytes = resp.bytes().await.map_err(|e| {
        eprintln!("[fetch_video_bytes] Body read error: {}", e);
        format!("Body read error: {}", e)
    })?.to_vec();
    eprintln!("[fetch_video_bytes] Fetched {} bytes (type={}) for: {}", bytes.len(), content_type, real_url);

    let result = tauri::ipc::Response::new(bytes.clone());
    let mut cache = state.video_cache.lock().await;
    cache.insert(key, bytes, content_type);
    Ok(result)
}

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

    let mut cfg = config::read_config(&state.config_path);
    cfg.save_path = Some(path);
    config::write_config(&state.config_path, &cfg)?;

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

#[tauri::command]
async fn dump_video_cache(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let cache = state.video_cache.lock().await;
    let mut paths = Vec::new();
    for (key, entry) in &cache.entries {
        let ext = if entry.content_type.contains("mp4") { "mp4" } else { "webm" };
        let path = format!("/tmp/crabbit_cache_{}_{}.{}", &key[..8], entry.bytes.len(), ext);
        std::fs::write(&path, &entry.bytes).map_err(|e| e.to_string())?;
        paths.push(format!("{} ({} bytes, {})", path, entry.bytes.len(), entry.content_type));
    }
    eprintln!("[dump] Wrote {} cached videos to /tmp", paths.len());
    Ok(paths)
}

#[tauri::command]
fn get_video_server_port(state: tauri::State<'_, AppState>) -> u16 {
    state.video_server_port
}

#[tauri::command]
fn log_frontend(level: String, msg: String) {
    eprintln!("[frontend:{}] {}", level, msg);
}

#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn mpv_load(
    state: tauri::State<'_, AppState>,
    video_url: String,
    audio_url: Option<String>,
    is_gif: bool,
    muted: bool,
    volume: i64,
) -> Result<(), String> {
    let mut player = state.mpv_player.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut p) = *player {
        let result = p.load(&video_url, audio_url.as_deref(), is_gif, muted, volume);
        if result.is_ok() {
            state.mpv_visible.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        result
    } else {
        Err("MpvPlayer not initialized".to_string())
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn mpv_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.mpv_visible.store(false, std::sync::atomic::Ordering::Relaxed);
    let mut player = state.mpv_player.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut p) = *player {
        p.stop()
    } else {
        Ok(())
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn mpv_reposition(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use crate::mpv_gtk::reposition_overlay;
    // Store WebView-relative coordinates; the GTK timer converts to screen coords
    reposition_overlay(x as i32, y as i32, width as i32, height as i32);
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn mpv_set_overlay_visible(
    state: tauri::State<'_, AppState>,
    visible: bool,
) -> Result<(), String> {
    // Only show overlay if mpv is actually active
    let player = state.mpv_player.lock().map_err(|e| e.to_string())?;
    if visible {
        if let Some(ref p) = *player {
            if p.is_active() {
                state.mpv_visible.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
    } else {
        state.mpv_visible.store(false, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn mpv_set_property(
    state: tauri::State<'_, AppState>,
    name: String,
    value: String,
) -> Result<(), String> {
    let player = state.mpv_player.lock().map_err(|e| e.to_string())?;
    if let Some(ref p) = *player {
        p.set_property_string(&name, &value)
    } else {
        Err("MpvPlayer not initialized".to_string())
    }
}

fn serve_bytes(bytes: &[u8], content_type: &str, range: &Option<String>) -> HttpResponse<Vec<u8>> {
    let total = bytes.len();

    if let Some(range_str) = range {
        if let Some(range_val) = range_str.strip_prefix("bytes=") {
            let mut parts = range_val.splitn(2, '-');
            if let (Some(start_str), Some(end_str)) = (parts.next(), parts.next()) {
                if let Ok(start) = start_str.trim().parse::<usize>() {
                    let end = if end_str.trim().is_empty() {
                        total.saturating_sub(1)
                    } else {
                        end_str.trim().parse::<usize>().unwrap_or(total - 1)
                    };
                    let end = end.min(total.saturating_sub(1));
                    if start < total && start <= end {
                        let slice = &bytes[start..=end];
                        eprintln!("[serve_bytes] 206 bytes {}-{}/{} ({} bytes) type={}", start, end, total, slice.len(), content_type);
                        return HttpResponse::builder()
                            .status(StatusCode::PARTIAL_CONTENT)
                            .header("Content-Type", content_type)
                            .header("Content-Length", slice.len().to_string())
                            .header("Content-Range", format!("bytes {}-{}/{}", start, end, total))
                            .header("Accept-Ranges", "bytes")
                            .body(slice.to_vec())
                            .unwrap();
                    }
                }
            }
        }
    }

    eprintln!("[serve_bytes] 200 full {} bytes type={}", total, content_type);
    HttpResponse::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Content-Length", total.to_string())
        .header("Accept-Ranges", "bytes")
        .body(bytes.to_vec())
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(verbose: bool) {
    let video_cache: videoserver::VideoCache = std::sync::Arc::new(tokio::sync::Mutex::new(videoserver::VideoCacheInner::new()));

    let video_server_port = tauri::async_runtime::block_on(
        videoserver::start_video_server(video_cache.clone())
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("media-proxy", move |ctx, request, responder| {
            let method = request.method().to_string();
            let uri_str = request.uri().to_string();
            let headers: Vec<String> = request.headers().iter().map(|(k, v)| format!("{}={}", k, v.to_str().unwrap_or("?"))).collect();
            eprintln!("[media-proxy] INCOMING {} {} headers=[{}]", method, uri_str, headers.join(", "));
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
                eprintln!("[media-proxy] Decoded: {} -> {} (range: {:?})", uri, video_url, range_header);

                if video_url.is_empty() {
                    eprintln!("[media-proxy] ERROR: empty URL after decoding");
                    responder.respond(
                        HttpResponse::builder()
                            .status(StatusCode::BAD_REQUEST)
                            .body(b"Empty URL".to_vec())
                            .unwrap(),
                    );
                    return;
                }

                let state = app_handle.state::<AppState>();
                let key = url_to_cache_key(&video_url);

                {
                    let mut cache = state.video_cache.lock().await;
                    cache.touch(&key);
                    if let Some(cached) = cache.entries.get(&key) {
                        eprintln!("[media-proxy] Cache HIT: {} ({} bytes)", video_url, cached.bytes.len());
                        responder.respond(serve_bytes(&cached.bytes, &cached.content_type, &range_header));
                        return;
                    }
                }

                eprintln!("[media-proxy] Cache MISS, fetching: {}", video_url);
                match state.client.get(&video_url).send().await {
                    Ok(resp) => {
                        let status = resp.status();
                        let content_type = resp
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("video/mp4")
                            .to_string();
                        let content_length = resp.content_length().unwrap_or(0);
                        eprintln!("[media-proxy] Upstream: status={} type={} len={}", status, content_type, content_length);
                        if !status.is_success() {
                            eprintln!("[media-proxy] ERROR: upstream {} for {}", status, video_url);
                        }
                        match resp.bytes().await {
                            Ok(bytes) => {
                                eprintln!("[media-proxy] Serving {} bytes (type={})", bytes.len(), content_type);
                                let bytes_vec = bytes.to_vec();
                                let response = serve_bytes(&bytes_vec, &content_type, &range_header);

                                let mut cache = state.video_cache.lock().await;
                                cache.insert(key, bytes_vec, content_type);

                                responder.respond(response);
                            }
                            Err(e) => {
                                eprintln!("[media-proxy] ERROR reading body: {}", e);
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
                        eprintln!("[media-proxy] ERROR fetching: {}", e);
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
                let path_part = uri
                    .strip_prefix("http://saved-media.localhost/")
                    .or_else(|| uri.strip_prefix("https://saved-media.localhost/"))
                    .or_else(|| uri.strip_prefix("saved-media://localhost/"))
                    .unwrap_or("");
                let decoded_path = percent_decode_str(path_part).decode_utf8_lossy().to_string();
                debug!("[saved-media] Request: {} -> {}", uri, decoded_path);

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
                        error!("[saved-media] Read error: {}", e);
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
        .setup(move |app| {
            let log_level = if verbose {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Warn
            };

            let log_builder = tauri_plugin_log::Builder::default()
                .level(log_level)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stderr,
                ));

            if verbose {
                eprintln!("[crabbit] Verbose logging enabled");
                eprintln!("[crabbit] media-proxy and saved-media protocol handlers registered");
            }

            app.handle().plugin(log_builder.build())?;

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

            // Initialize mpv player on Linux
            #[cfg(target_os = "linux")]
            let mpv_player = {
                match mpvplayer::MpvPlayer::new(video_server_port) {
                    Ok(player) => {
                        eprintln!("[crabbit] MpvPlayer created successfully");
                        Mutex::new(Some(player))
                    }
                    Err(e) => {
                        eprintln!("[crabbit] Failed to create MpvPlayer: {}", e);
                        Mutex::new(None)
                    }
                }
            };

            #[cfg(target_os = "linux")]
            let mpv_player_arc = std::sync::Arc::new(mpv_player);

            app.manage(AppState {
                client: build_client(),
                favorites_path: fav_path,
                favorites: Mutex::new(favs),
                video_cache: video_cache.clone(),
                video_server_port,
                config_path: cfg_path,
                save_path: Mutex::new(save_path),
                saved_ids: Mutex::new(saved_ids),
                #[cfg(target_os = "linux")]
                mpv_player: mpv_player_arc.clone(),
                #[cfg(target_os = "linux")]
                mpv_visible: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            });

            // Set up mpv overlay window on Linux
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let state = app.state::<AppState>();
                    let visible_flag = state.mpv_visible.clone();
                    match mpv_gtk::setup_overlay(&window, mpv_player_arc, visible_flag) {
                        Ok(()) => {
                            eprintln!("[crabbit] mpv overlay setup successful");
                        }
                        Err(e) => {
                            eprintln!("[crabbit] mpv overlay setup failed: {}", e);
                        }
                    }
                } else {
                    eprintln!("[crabbit] Could not find main window for mpv setup");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_posts,
            get_favorites,
            add_favorite,
            remove_favorite,
            preload_video,
            fetch_video_bytes,
            dump_video_cache,
            get_video_server_port,
            log_frontend,
            toggle_devtools,
            save_post,
            get_saved_posts,
            delete_saved_post,
            is_post_saved,
            get_save_path,
            set_save_path,
            open_save_folder,
            #[cfg(target_os = "linux")]
            mpv_load,
            #[cfg(target_os = "linux")]
            mpv_stop,
            #[cfg(target_os = "linux")]
            mpv_set_property,
            #[cfg(target_os = "linux")]
            mpv_set_overlay_visible,
            #[cfg(target_os = "linux")]
            mpv_reposition,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
