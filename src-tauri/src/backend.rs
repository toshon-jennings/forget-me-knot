use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub id: String,
    pub name: String,
    pub url: String,
    pub favicon: String,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub added_at: String,
    pub last_used_at: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolBox {
    pub services: Vec<Service>,
    pub categories: Vec<Category>,
}

impl Default for ToolBox {
    fn default() -> Self {
        Self {
            services: vec![],
            categories: vec![
                Category {
                    id: "ai".into(),
                    label: "AI & Agents".into(),
                },
                Category {
                    id: "dev".into(),
                    label: "Developer Tools".into(),
                },
                Category {
                    id: "media".into(),
                    label: "Media & Design".into(),
                },
                Category {
                    id: "infra".into(),
                    label: "Infra & Cloud".into(),
                },
                Category {
                    id: "productivity".into(),
                    label: "Productivity".into(),
                },
            ],
        }
    }
}

pub fn data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".toolbox")
}

pub fn ensure_dirs() {
    let dir = data_dir();
    let fav_dir = dir.join("favicons");
    let _ = fs::create_dir_all(&dir);
    let _ = fs::create_dir_all(&fav_dir);
}

pub fn load_toolbox() -> ToolBox {
    ensure_dirs();
    let file = data_dir().join("toolbox.json");
    if let Ok(data) = fs::read_to_string(&file) {
        if let Ok(tb) = serde_json::from_str(&data) {
            return tb;
        }
    }
    let default = ToolBox::default();
    save_toolbox(&default);
    default
}

pub fn save_toolbox(tb: &ToolBox) {
    ensure_dirs();
    let file = data_dir().join("toolbox.json");
    if let Ok(data) = serde_json::to_string_pretty(tb) {
        let _ = fs::write(file, data);
    }
}

pub fn fetch_favicon_url(url: &str) -> String {
    let base = url.split('/').take(3).collect::<Vec<_>>().join("/");
    format!("{}/favicon.ico", base)
}

#[tauri::command]
pub fn get_data() -> ToolBox {
    load_toolbox()
}

#[tauri::command]
pub fn add_service(payload: serde_json::Value) -> Result<ToolBox, String> {
    let mut tb = load_toolbox();
    let id = uuid::Uuid::new_v4().to_string();
    let url = payload["url"].as_str().unwrap_or("").to_string();
    let name = payload["name"].as_str().unwrap_or("").to_string();
    
    let category = payload["category"].as_str().and_then(|s| if s.is_empty() { None } else { Some(s.to_string()) });
    let notes = payload["notes"].as_str().and_then(|s| if s.is_empty() { None } else { Some(s.to_string()) });
    
    let now = chrono::Utc::now().to_rfc3339();

    let service = Service {
        id,
        name,
        url: url.clone(),
        favicon: fetch_favicon_url(&url),
        category,
        notes,
        added_at: now.clone(),
        last_used_at: now,
        status: "active".into(),
    };
    
    tb.services.push(service);
    save_toolbox(&tb);
    Ok(tb)
}

#[tauri::command]
pub fn edit_service(id: String, payload: serde_json::Value) -> Result<ToolBox, String> {
    let mut tb = load_toolbox();
    
    if let Some(service) = tb.services.iter_mut().find(|s| s.id == id) {
        if let Some(url) = payload["url"].as_str() {
            service.url = url.to_string();
            service.favicon = fetch_favicon_url(url);
        }
        if let Some(name) = payload["name"].as_str() {
            service.name = name.to_string();
        }
        if let Some(category) = payload.get("category") {
            service.category = category.as_str().and_then(|s| if s.is_empty() { None } else { Some(s.to_string()) });
        }
        if let Some(notes) = payload.get("notes") {
            service.notes = notes.as_str().and_then(|s| if s.is_empty() { None } else { Some(s.to_string()) });
        }
    }
    
    save_toolbox(&tb);
    Ok(tb)
}

#[tauri::command]
pub fn open_service(app: AppHandle, id: String) -> Result<(), String> {
    let mut tb = load_toolbox();
    if let Some(service) = tb.services.iter_mut().find(|s| s.id == id) {
        service.last_used_at = chrono::Utc::now().to_rfc3339();
        
        let url = service.url.clone();
        save_toolbox(&tb);
        
        // Open URL in default browser
        let _ = Command::new("open")
            .arg(&url)
            .spawn();
    }
    // Also toggle window visibility to hide it
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}
