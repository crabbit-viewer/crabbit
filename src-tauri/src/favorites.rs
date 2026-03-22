use std::fs;
use std::path::PathBuf;

pub fn favorites_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("favorites.json")
}

pub fn read_favorites(path: &PathBuf) -> Vec<String> {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => vec![],
    }
}

pub fn write_favorites(path: &PathBuf, favorites: &[String]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(favorites)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Failed to write file: {}", e))
}
