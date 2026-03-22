use reqwest::Client;
use serde_json::Value;

use super::types::{MediaItem, MediaType};

pub fn build_client() -> Client {
    Client::builder()
        .user_agent("desktop:crabbit:v0.1.0")
        .build()
        .expect("Failed to build HTTP client")
}

pub async fn fetch_listing(
    client: &Client,
    subreddit: &str,
    sort: &str,
    time_range: &str,
    after: Option<&str>,
    limit: u32,
) -> Result<Value, String> {
    let mut url = format!(
        "https://www.reddit.com/r/{}/{}.json?limit={}&raw_json=1",
        subreddit, sort, limit
    );

    if let Some(after_cursor) = after {
        url.push_str(&format!("&after={}", after_cursor));
    }

    if sort == "top" || sort == "controversial" {
        url.push_str(&format!("&t={}", time_range));
    }

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Reddit returned status {}", response.status()));
    }

    response
        .json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Get a temporary auth token from the RedGifs API.
async fn redgifs_token(client: &Client) -> Result<String, String> {
    eprintln!("[redgifs] Requesting auth token...");
    let resp: Value = client
        .get("https://api.redgifs.com/v2/auth/temporary")
        .send()
        .await
        .map_err(|e| { eprintln!("[redgifs] Auth request failed: {}", e); format!("RedGifs auth failed: {}", e) })?
        .json()
        .await
        .map_err(|e| { eprintln!("[redgifs] Auth parse failed: {}", e); format!("RedGifs auth parse failed: {}", e) })?;
    let token = resp["token"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No token in RedGifs auth response".to_string());
    match &token {
        Ok(_) => eprintln!("[redgifs] Got auth token OK"),
        Err(e) => eprintln!("[redgifs] Auth token error: {}", e),
    }
    token
}

/// Resolve a RedGifs slug to a direct HD video URL.
async fn redgifs_video_url(client: &Client, token: &str, slug: &str) -> Result<String, String> {
    let url = format!("https://api.redgifs.com/v2/gifs/{}", slug);
    eprintln!("[redgifs] Resolving slug '{}' ...", slug);
    let resp: Value = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| { eprintln!("[redgifs] Fetch failed for '{}': {}", slug, e); format!("RedGifs fetch failed: {}", e) })?
        .json()
        .await
        .map_err(|e| { eprintln!("[redgifs] Parse failed for '{}': {}", slug, e); format!("RedGifs parse failed: {}", e) })?;
    let video_url = resp["gif"]["urls"]["hd"]
        .as_str()
        .or_else(|| resp["gif"]["urls"]["sd"].as_str())
        .map(String::from)
        .ok_or_else(|| {
            eprintln!("[redgifs] No video URL for '{}'. Response keys: {:?}", slug, resp["gif"]["urls"].as_object().map(|o| o.keys().collect::<Vec<_>>()));
            "No video URL in RedGifs response".to_string()
        });
    match &video_url {
        Ok(u) => eprintln!("[redgifs] Resolved '{}' -> {}", slug, u),
        Err(e) => eprintln!("[redgifs] Failed '{}': {}", slug, e),
    }
    video_url
}

/// Resolve all RedGifs posts in a listing from embed placeholders to native videos.
pub async fn resolve_redgifs(client: &Client, posts: &mut Vec<super::types::MediaPost>) {
    // Collect indices of posts that need resolution
    let redgifs_indices: Vec<(usize, String)> = posts
        .iter()
        .enumerate()
        .filter_map(|(i, p)| {
            p.embed_url
                .as_ref()
                .and_then(|u| u.strip_prefix("redgifs:"))
                .map(|slug| (i, slug.to_string()))
        })
        .collect();

    if redgifs_indices.is_empty() {
        eprintln!("[redgifs] No RedGifs posts to resolve");
        return;
    }
    eprintln!("[redgifs] Found {} RedGifs posts to resolve concurrently", redgifs_indices.len());

    // Get auth token
    let token = match redgifs_token(client).await {
        Ok(t) => t,
        Err(_) => {
            // Fall back to iframe embeds for all
            for (idx, slug) in &redgifs_indices {
                posts[*idx].embed_url = Some(format!("https://www.redgifs.com/ifr/{}", slug));
            }
            return;
        }
    };

    // Resolve all concurrently (API calls are small JSON, not video data)
    let futures: Vec<_> = redgifs_indices
        .iter()
        .map(|(_, slug)| redgifs_video_url(client, &token, slug))
        .collect();
    let results = futures::future::join_all(futures).await;

    for ((idx, slug), result) in redgifs_indices.into_iter().zip(results) {
        match result {
            Ok(video_url) => {
                let proxy_url = format!(
                    "http://media-proxy.localhost/{}",
                    percent_encoding::utf8_percent_encode(&video_url, percent_encoding::NON_ALPHANUMERIC)
                );
                let post = &mut posts[idx];
                post.media_type = MediaType::Video;
                post.media = vec![MediaItem {
                    url: proxy_url,
                    width: None,
                    height: None,
                    caption: None,
                }];
                post.embed_url = None;
            }
            Err(_) => {
                // Fall back to iframe embed
                posts[idx].embed_url = Some(format!("https://www.redgifs.com/ifr/{}", slug));
            }
        }
    }
}
