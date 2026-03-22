use serde_json::Value;

use super::types::{FetchResult, MediaItem, MediaPost, MediaType};

pub fn parse_listing(listing: &Value) -> FetchResult {
    let after = listing["data"]["after"].as_str().map(String::from);

    let posts: Vec<MediaPost> = listing["data"]["children"]
        .as_array()
        .map(|children| {
            children
                .iter()
                .filter_map(|child| parse_post(&child["data"]))
                .collect()
        })
        .unwrap_or_default();

    FetchResult { posts, after }
}

fn parse_post(post: &Value) -> Option<MediaPost> {
    // Skip self/text posts
    if post["is_self"].as_bool().unwrap_or(false) {
        return None;
    }

    let id = post["id"].as_str()?.to_string();
    let title = post["title"].as_str().unwrap_or("").to_string();
    let author = post["author"].as_str().unwrap_or("[deleted]").to_string();
    let score = post["score"].as_i64().unwrap_or(0);
    let num_comments = post["num_comments"].as_u64().unwrap_or(0);
    let permalink = post["permalink"].as_str().unwrap_or("").to_string();
    let subreddit = post["subreddit"].as_str().unwrap_or("").to_string();
    let over_18 = post["over_18"].as_bool().unwrap_or(false);
    let url = post["url"].as_str().unwrap_or("");
    let domain = post["domain"].as_str().unwrap_or("");
    let post_hint = post["post_hint"].as_str().unwrap_or("");

    let base = MediaPost {
        id,
        title,
        author,
        score,
        num_comments,
        permalink,
        subreddit,
        over_18,
        media_type: MediaType::Image,
        media: vec![],
        audio_url: None,
        embed_url: None,
    };

    // 1. Gallery
    if post["is_gallery"].as_bool().unwrap_or(false) {
        if let Some(result) = try_gallery(post, base.clone()) {
            return Some(result);
        }
    }

    // 2. Reddit video (v.redd.it)
    if post["is_video"].as_bool().unwrap_or(false) {
        if let Some(result) = try_reddit_video(post, base.clone()) {
            return Some(result);
        }
    }

    // 3. Direct image URL
    let url_lower = url.to_lowercase();
    if url_lower.ends_with(".jpg")
        || url_lower.ends_with(".jpeg")
        || url_lower.ends_with(".png")
        || url_lower.ends_with(".webp")
    {
        return Some(MediaPost {
            media_type: MediaType::Image,
            media: vec![MediaItem {
                url: url.to_string(),
                width: None,
                height: None,
                caption: None,
            }],
            ..base
        });
    }

    // 4. Direct gif URL
    if url_lower.ends_with(".gif") {
        return Some(MediaPost {
            media_type: MediaType::Image,
            media: vec![MediaItem {
                url: url.to_string(),
                width: None,
                height: None,
                caption: None,
            }],
            ..base
        });
    }

    // 5. i.redd.it or i.imgur.com domain
    if domain == "i.redd.it" || domain == "i.imgur.com" {
        return Some(MediaPost {
            media_type: MediaType::Image,
            media: vec![MediaItem {
                url: url.to_string(),
                width: None,
                height: None,
                caption: None,
            }],
            ..base
        });
    }

    // 6. imgur.com (no extension, not album) -> transform to direct image
    if domain == "imgur.com" && !url.contains("/a/") && !url.contains("/gallery/") {
        let imgur_id = url.rsplit('/').next().unwrap_or("");
        if !imgur_id.is_empty() {
            return Some(MediaPost {
                media_type: MediaType::Image,
                media: vec![MediaItem {
                    url: format!("https://i.imgur.com/{}.jpg", imgur_id),
                    width: None,
                    height: None,
                    caption: None,
                }],
                ..base
            });
        }
    }

    // 7. .gifv -> .mp4
    if url_lower.ends_with(".gifv") {
        let mp4_url = format!("{}.mp4", &url[..url.len() - 5]);
        return Some(MediaPost {
            media_type: MediaType::AnimatedGif,
            media: vec![MediaItem {
                url: mp4_url,
                width: None,
                height: None,
                caption: None,
            }],
            ..base
        });
    }

    // 8. Direct .mp4
    if url_lower.ends_with(".mp4") {
        return Some(MediaPost {
            media_type: MediaType::Video,
            media: vec![MediaItem {
                url: url.to_string(),
                width: None,
                height: None,
                caption: None,
            }],
            ..base
        });
    }

    // 9. post_hint == "image" with preview
    if post_hint == "image" {
        if let Some(preview_url) = post["preview"]["images"][0]["source"]["url"].as_str() {
            return Some(MediaPost {
                media_type: MediaType::Image,
                media: vec![MediaItem {
                    url: preview_url.to_string(),
                    width: post["preview"]["images"][0]["source"]["width"].as_u64().map(|v| v as u32),
                    height: post["preview"]["images"][0]["source"]["height"].as_u64().map(|v| v as u32),
                    caption: None,
                }],
                ..base
            });
        }
    }

    // 10. YouTube
    if domain.contains("youtube.com") || domain.contains("youtu.be") {
        if let Some(embed) = youtube_embed_url(url) {
            return Some(MediaPost {
                media_type: MediaType::Embed,
                media: vec![],
                embed_url: Some(embed),
                ..base
            });
        }
    }

    // 11. Redgifs
    if domain.contains("redgifs.com") {
        if let Some(embed) = redgifs_embed_url(url) {
            return Some(MediaPost {
                media_type: MediaType::Embed,
                media: vec![],
                embed_url: Some(embed),
                ..base
            });
        }
    }

    // 12. rich:video with secure_media_embed
    if post_hint == "rich:video" {
        if let Some(content) = post["secure_media_embed"]["content"].as_str() {
            if let Some(src) = extract_iframe_src(content) {
                return Some(MediaPost {
                    media_type: MediaType::Embed,
                    media: vec![],
                    embed_url: Some(src),
                    ..base
                });
            }
        }
    }

    // 13. Skip everything else
    None
}

fn try_gallery(post: &Value, base: MediaPost) -> Option<MediaPost> {
    let metadata = post.get("media_metadata")?;
    let gallery_items = post["gallery_data"]["items"].as_array()?;

    let mut media = Vec::new();

    for item in gallery_items {
        let media_id = item["media_id"].as_str()?;
        let entry = metadata.get(media_id)?;

        // Check status
        if entry["status"].as_str() != Some("valid") {
            continue;
        }

        // Get the best quality image: s (source) field
        let source = &entry["s"];
        let url = source["u"]
            .as_str()
            .or_else(|| source["gif"].as_str())
            .or_else(|| source["mp4"].as_str())?;

        let width = source["x"].as_u64().map(|v| v as u32);
        let height = source["y"].as_u64().map(|v| v as u32);
        let caption = item["caption"].as_str().map(String::from);

        media.push(MediaItem {
            url: url.to_string(),
            width,
            height,
            caption,
        });
    }

    if media.is_empty() {
        return None;
    }

    Some(MediaPost {
        media_type: MediaType::Gallery,
        media,
        ..base
    })
}

fn try_reddit_video(post: &Value, base: MediaPost) -> Option<MediaPost> {
    let reddit_video = post["media"]["reddit_video"].as_object()?;
    let fallback_url = reddit_video.get("fallback_url")?.as_str()?;
    let width = reddit_video
        .get("width")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    let height = reddit_video
        .get("height")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32);
    let is_gif = reddit_video
        .get("is_gif")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Construct audio URL - try both naming conventions
    let audio_url = if !is_gif {
        // Extract base URL before DASH_
        if let Some(dash_pos) = fallback_url.rfind("DASH_") {
            let base_url = &fallback_url[..dash_pos];
            Some(format!("{}DASH_AUDIO_128.mp4", base_url))
        } else {
            None
        }
    } else {
        None
    };

    Some(MediaPost {
        media_type: if is_gif {
            MediaType::AnimatedGif
        } else {
            MediaType::Video
        },
        media: vec![MediaItem {
            url: fallback_url.to_string(),
            width,
            height,
            caption: None,
        }],
        audio_url,
        ..base
    })
}

fn youtube_embed_url(url: &str) -> Option<String> {
    // youtube.com/watch?v=ID
    if let Some(pos) = url.find("v=") {
        let id = &url[pos + 2..];
        let id = id.split('&').next().unwrap_or(id);
        return Some(format!("https://www.youtube.com/embed/{}", id));
    }
    // youtu.be/ID
    if url.contains("youtu.be/") {
        let id = url.rsplit("youtu.be/").next()?;
        let id = id.split('?').next().unwrap_or(id);
        return Some(format!("https://www.youtube.com/embed/{}", id));
    }
    None
}

fn redgifs_embed_url(url: &str) -> Option<String> {
    // redgifs.com/watch/slug -> redgifs.com/ifr/slug
    if let Some(slug) = url.rsplit("/watch/").next() {
        let slug = slug.split('?').next().unwrap_or(slug);
        return Some(format!("https://www.redgifs.com/ifr/{}", slug));
    }
    None
}

fn extract_iframe_src(html: &str) -> Option<String> {
    // Simple extraction of src="..." from iframe HTML
    let src_pos = html.find("src=\"").or_else(|| html.find("src='"))?;
    let quote_char = html.as_bytes()[src_pos + 4] as char;
    let start = src_pos + 5;
    let rest = &html[start..];
    let end = rest.find(quote_char)?;
    Some(rest[..end].to_string())
}
