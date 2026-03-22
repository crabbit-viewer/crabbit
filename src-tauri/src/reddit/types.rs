use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MediaType {
    Image,
    Video,
    AnimatedGif,
    Gallery,
    Embed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaPost {
    pub id: String,
    pub title: String,
    pub author: String,
    pub score: i64,
    pub num_comments: u64,
    pub permalink: String,
    pub subreddit: String,
    pub over_18: bool,
    pub media_type: MediaType,
    pub media: Vec<MediaItem>,
    pub audio_url: Option<String>,
    pub embed_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub posts: Vec<MediaPost>,
    pub after: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FetchParams {
    pub subreddit: String,
    pub sort: Option<String>,
    pub time_range: Option<String>,
    pub after: Option<String>,
    pub limit: Option<u32>,
}
