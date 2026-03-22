use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

pub struct CachedVideo {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

pub type VideoCache = Arc<Mutex<HashMap<String, CachedVideo>>>;
