use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

pub struct CachedVideo {
    pub bytes: Vec<u8>,
    pub content_type: String,
    pub last_access: u64,
}

/// Monotonic counter for LRU ordering.
pub struct VideoCacheInner {
    pub entries: HashMap<String, CachedVideo>,
    pub counter: u64,
    pub inflight: std::collections::HashSet<String>,
}

impl VideoCacheInner {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
            counter: 0,
            inflight: std::collections::HashSet::new(),
        }
    }

    pub fn touch(&mut self, key: &str) {
        self.counter += 1;
        if let Some(entry) = self.entries.get_mut(key) {
            entry.last_access = self.counter;
        }
    }

    pub fn insert(&mut self, key: String, bytes: Vec<u8>, content_type: String) {
        self.ensure_capacity();
        self.counter += 1;
        self.entries.insert(key, CachedVideo {
            bytes,
            content_type,
            last_access: self.counter,
        });
    }

    fn ensure_capacity(&mut self) {
        const MAX_ENTRIES: usize = 50;
        const EVICT_COUNT: usize = 10;

        if self.entries.len() >= MAX_ENTRIES {
            // Evict the least recently accessed entries
            let mut entries_by_access: Vec<(String, u64)> = self.entries.iter()
                .map(|(k, v)| (k.clone(), v.last_access))
                .collect();
            entries_by_access.sort_by_key(|(_, access)| *access);

            for (key, _) in entries_by_access.into_iter().take(EVICT_COUNT) {
                self.entries.remove(&key);
            }
            eprintln!("[cache] LRU evicted {} entries, {} remaining", EVICT_COUNT, self.entries.len());
        }
    }
}

pub type VideoCache = Arc<Mutex<VideoCacheInner>>;

/// Parse a Range header value like "bytes=0-1023" or "bytes=500-".
/// Returns (start, end) inclusive, clamped to total length.
fn parse_range(range_str: &str, total: usize) -> Option<(usize, usize)> {
    let range_str = range_str.strip_prefix("bytes=")?;
    let mut parts = range_str.splitn(2, '-');
    let start_str = parts.next()?.trim();
    let end_str = parts.next()?.trim();

    let start: usize = start_str.parse().ok()?;
    let end: usize = if end_str.is_empty() {
        total.saturating_sub(1)
    } else {
        end_str.parse().ok()?
    };

    if start >= total {
        return None;
    }
    let end = end.min(total - 1);
    if start > end {
        return None;
    }
    Some((start, end))
}

async fn serve_cached(
    Path(cache_key): Path<String>,
    State(cache): State<VideoCache>,
    headers: HeaderMap,
) -> Response {
    let mut cache = cache.lock().await;
    cache.touch(&cache_key);

    let cached = match cache.entries.get(&cache_key) {
        Some(c) => c,
        None => {
            eprintln!("[videoserver] 404 key={}", cache_key);
            return (StatusCode::NOT_FOUND, "Not found").into_response();
        }
    };

    let total = cached.bytes.len();
    let content_type = cached.content_type.clone();
    let range_header = headers
        .get("range")
        .and_then(|v| v.to_str().ok());

    if let Some(range_str) = range_header {
        if let Some((start, end)) = parse_range(range_str, total) {
            let slice = cached.bytes[start..=end].to_vec();
            let len = slice.len();
            eprintln!(
                "[videoserver] 206 bytes {}-{}/{} ({} bytes) key={}",
                start, end, total, len, cache_key
            );
            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Type", &content_type)
                .header("Content-Length", len.to_string())
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, total))
                .header("Accept-Ranges", "bytes")
                .header("Access-Control-Allow-Origin", "*")
                .body(axum::body::Body::from(slice))
                .unwrap()
                .into_response();
        }
    }

    let bytes = cached.bytes.clone();
    eprintln!("[videoserver] 200 full {} bytes key={}", total, cache_key);
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", &content_type)
        .header("Content-Length", total.to_string())
        .header("Accept-Ranges", "bytes")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from(bytes))
        .unwrap()
        .into_response()
}

/// Start the localhost video server on a random port. Returns the port number.
pub async fn start_video_server(cache: VideoCache) -> u16 {
    let app = Router::new()
        .route("/{cache_key}", get(serve_cached))
        .with_state(cache);

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind video server");
    let port = listener.local_addr().unwrap().port();
    eprintln!("[videoserver] Listening on 127.0.0.1:{}", port);

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    port
}
