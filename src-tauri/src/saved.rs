use crate::decode_proxy_url;
use crate::reddit::types::{MediaPost, MediaType};
use chrono::Utc;
use log::debug;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedPostMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    pub subreddit: String,
    pub score: i64,
    pub num_comments: u64,
    pub permalink: String,
    pub media_type: MediaType,
    pub saved_at: String,
    pub files: Vec<String>,
    pub audio_file: Option<String>,
}

fn sanitize_title(title: &str, max_len: usize) -> String {
    let sanitized = sanitize_filename::sanitize(title);
    let truncated: String = sanitized.chars().take(max_len).collect();
    truncated.trim_end_matches(|c: char| c == '.' || c == ' ').to_string()
}

fn post_base_name(id: &str, title: &str) -> String {
    let safe_title = sanitize_title(title, 80);
    if safe_title.is_empty() {
        id.to_string()
    } else {
        format!("{}_{}", id, safe_title)
    }
}

fn extension_from_url(url: &str) -> &str {
    let path = url.split('?').next().unwrap_or(url);
    if let Some(dot_pos) = path.rfind('.') {
        let ext = &path[dot_pos + 1..];
        match ext {
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "mp4" | "webm" => ext,
            _ => "jpg",
        }
    } else {
        "jpg"
    }
}

pub async fn save_post(
    client: &reqwest::Client,
    save_path: &Path,
    post: &MediaPost,
) -> Result<SavedPostMeta, String> {
    let sub_dir = save_path.join(post.subreddit.to_lowercase());
    fs::create_dir_all(&sub_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let base = post_base_name(&post.id, &post.title);
    let mut files: Vec<String> = Vec::new();
    let mut audio_file: Option<String> = None;

    match post.media_type {
        MediaType::Gallery => {
            let gallery_dir = sub_dir.join(&base);
            fs::create_dir_all(&gallery_dir)
                .map_err(|e| format!("Failed to create gallery dir: {}", e))?;

            let download_tasks: Vec<_> = post.media.iter().enumerate().map(|(i, item)| {
                let real_url = decode_proxy_url(&item.url);
                let ext = extension_from_url(&real_url).to_string();
                let filename = format!("{}.{}", i, ext);
                let file_path = gallery_dir.join(&filename);
                let rel_path = format!("{}/{}", base, filename);
                async move {
                    download_file(client, &real_url, &file_path).await?;
                    Ok::<String, String>(rel_path)
                }
            }).collect();

            let results = futures::future::join_all(download_tasks).await;
            for result in results {
                files.push(result?);
            }
        }
        MediaType::Embed => {
            return Err("Embed posts cannot be saved".to_string());
        }
        _ => {
            if let Some(item) = post.media.first() {
                let real_url = decode_proxy_url(&item.url);
                let ext = extension_from_url(&real_url);
                let filename = format!("{}.{}", base, ext);
                let file_path = sub_dir.join(&filename);
                download_file(client, &real_url, &file_path).await?;
                files.push(filename);
            }
        }
    }

    // Download audio if present
    if let Some(ref audio_url) = post.audio_url {
        let real_audio = decode_proxy_url(audio_url);
        let audio_name = format!("{}_audio.mp4", base);
        let audio_path = sub_dir.join(&audio_name);
        download_file(client, &real_audio, &audio_path).await?;
        audio_file = Some(audio_name);
    }

    let meta = SavedPostMeta {
        id: post.id.clone(),
        title: post.title.clone(),
        author: post.author.clone(),
        subreddit: post.subreddit.clone(),
        score: post.score,
        num_comments: post.num_comments,
        permalink: post.permalink.clone(),
        media_type: post.media_type.clone(),
        saved_at: Utc::now().to_rfc3339(),
        files: files.clone(),
        audio_file: audio_file.clone(),
    };

    // Write sidecar JSON
    let sidecar_path = sub_dir.join(format!("{}.json", base));
    let json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    fs::write(&sidecar_path, json).map_err(|e| format!("Failed to write sidecar: {}", e))?;

    Ok(meta)
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    path: &Path,
) -> Result<(), String> {
    debug!("[save] Downloading: {} -> {:?}", url, path);
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {} for {}", resp.status(), url));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read body: {}", e))?;

    fs::write(path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;
    debug!("[save] Saved {} bytes to {:?}", bytes.len(), path);
    Ok(())
}

pub fn list_saved_posts(save_path: &Path) -> Result<Vec<SavedPostMeta>, String> {
    let mut posts = Vec::new();

    if !save_path.exists() {
        return Ok(posts);
    }

    let entries = fs::read_dir(save_path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Each subdirectory is a subreddit
        let sub_entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
        for sub_entry in sub_entries.flatten() {
            let file_path = sub_entry.path();
            if file_path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&file_path) {
                    if let Ok(meta) = serde_json::from_str::<SavedPostMeta>(&content) {
                        posts.push(meta);
                    }
                }
            }
        }
    }

    // Sort by saved_at descending (newest first)
    posts.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(posts)
}

pub fn delete_saved_post(save_path: &Path, subreddit: &str, post_id: &str) -> Result<(), String> {
    let sub_dir = save_path.join(subreddit.to_lowercase());
    if !sub_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(&sub_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(post_id) {
            if path.is_dir() {
                fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove dir: {}", e))?;
            } else {
                fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))?;
            }
        }
    }
    Ok(())
}

pub fn load_saved_ids(save_path: &Path) -> HashSet<String> {
    let mut ids = HashSet::new();
    if let Ok(posts) = list_saved_posts(save_path) {
        for post in posts {
            ids.insert(post.id);
        }
    }
    ids
}
