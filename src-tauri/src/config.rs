use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigData {
    pub save_path: Option<String>,
}

pub fn config_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("config.json")
}

pub fn read_config(path: &PathBuf) -> ConfigData {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => ConfigData::default(),
    }
}

pub fn write_config(path: &PathBuf, config: &ConfigData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Failed to write config: {}", e))
}

pub fn resolve_save_path(config: &ConfigData, app_data_dir: &PathBuf) -> PathBuf {
    if let Some(ref p) = config.save_path {
        PathBuf::from(p)
    } else if let Some(pics) = dirs::picture_dir() {
        pics.join("Crabbit")
    } else {
        app_data_dir.join("saved")
    }
}
