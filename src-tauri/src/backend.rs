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
                Category {
                    id: "learning".into(),
                    label: "Learning".into(),
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
        if let Ok(mut tb) = serde_json::from_str::<ToolBox>(&data) {
            let has_learning = tb.categories.iter().any(|c| c.id == "learning");
            if !has_learning {
                tb.categories.push(Category {
                    id: "learning".into(),
                    label: "Learning".into(),
                });
                save_toolbox(&tb);
            }
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

// --- Favicon resolution ------------------------------------------------------
//
// This runs in Rust rather than in the webview on purpose. An <img> tag can see
// only "did the bytes decode" and "what size" — it cannot see the HTTP status or
// the Content-Type. Both are load-bearing here:
//
//   * Google's S2 service answers unknown domains with HTTP 404 and a 16x16
//     generic globe in the body. Browsers happily render a 404 body, so `onload`
//     fires and `onerror` never does. That is the globe that kept appearing on
//     Namecheap, Versed and SuperFile — no front-end fallback could catch it.
//   * Sites behind bot protection answer /favicon.ico with an HTML error page
//     (namecheap.com returns 403 + text/html). Those must be rejected too.
//
// So each candidate is validated on status, Content-Type, and magic bytes, and
// anything unproven falls through to the caller's letter avatar.

const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0x89, b'P', b'N', b'G', ..] => Some("png"),
        [0x00, 0x00, 0x01, 0x00, ..] => Some("ico"),
        [b'G', b'I', b'F', b'8', ..] => Some("gif"),
        [0xFF, 0xD8, 0xFF, ..] => Some("jpg"),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some("webp"),
        _ => {
            // SVG is text; sniff the first non-whitespace markup.
            let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]);
            let head = head.trim_start();
            if head.starts_with("<svg") || (head.starts_with("<?xml") && head.contains("<svg")) {
                Some("svg")
            } else {
                None
            }
        }
    }
}

fn mime_for(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "ico" => "image/x-icon",
        "gif" => "image/gif",
        "jpg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// GET a candidate and return its bytes only if it is genuinely an image.
fn fetch_image(client: &reqwest::blocking::Client, url: &str) -> Option<(Vec<u8>, &'static str)> {
    let resp = client.get(url).send().ok()?;
    if !resp.status().is_success() {
        return None; // kills the S2 404 globe
    }
    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if ct.contains("text/html") {
        return None; // kills bot-protection error pages served as favicons
    }
    let bytes = resp.bytes().ok()?.to_vec();
    if bytes.is_empty() {
        return None;
    }
    let ext = image_extension(&bytes)?;
    Some((bytes, ext))
}

/// Pull the first declared <link rel="...icon..."> out of a page and absolutise it.
fn declared_icon(client: &reqwest::blocking::Client, page_url: &str, origin: &str) -> Option<String> {
    let html = client.get(page_url).send().ok()?.text().ok()?;
    let lower = html.to_lowercase();
    let mut cursor = 0usize;
    while let Some(found) = lower[cursor..].find("<link") {
        let start = cursor + found;
        let end = lower[start..].find('>').map(|e| start + e)? + 1;
        let tag = &html[start..end];
        let tag_lower = &lower[start..end];
        cursor = end;
        if !tag_lower.contains("rel=") || !tag_lower.contains("icon") {
            continue;
        }
        // Skip mask-icons: they are monochrome silhouettes, not the real mark.
        if tag_lower.contains("mask-icon") {
            continue;
        }
        let href_at = match tag_lower.find("href=") {
            Some(h) => h + 5,
            None => continue,
        };
        let rest = &tag[href_at..];
        let quote = rest.chars().next()?;
        let (delim, body) = if quote == '"' || quote == '\'' {
            (quote, &rest[1..])
        } else {
            (' ', rest)
        };
        let href = match body.find(delim) {
            Some(e) => &body[..e],
            None => body,
        }
        .trim();
        if href.is_empty() {
            continue;
        }
        return Some(if href.starts_with("http") {
            href.to_string()
        } else if let Some(stripped) = href.strip_prefix("//") {
            format!("https://{}", stripped)
        } else if href.starts_with('/') {
            format!("{}{}", origin, href)
        } else {
            format!("{}/{}", origin, href)
        });
    }
    None
}

/// Resolve a service URL to a data URI for its real icon, or None.
///
/// Order matters: the site's own declaration wins, then its /favicon.ico, then
/// the registrable parent domain (console.firebase.google.com has no icon of its
/// own but firebase.google.com does — asking S2 for it yields Google's "G"),
/// and only then S2 as a last resort.
fn resolve_favicon(page_url: &str) -> Option<String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;

    let origin = page_url.split('/').take(3).collect::<Vec<_>>().join("/");
    let host = origin.split("//").nth(1)?.to_string();

    let mut candidates: Vec<String> = Vec::new();
    if let Some(declared) = declared_icon(&client, page_url, &origin) {
        candidates.push(declared);
    }
    candidates.push(format!("{}/favicon.ico", origin));

    // Walk up one label at a time: ap.www.namecheap.com -> www.namecheap.com -> namecheap.com
    let labels: Vec<&str> = host.split('.').collect();
    for i in 1..labels.len().saturating_sub(1) {
        candidates.push(format!("https://{}/favicon.ico", labels[i..].join(".")));
    }

    candidates.push(format!(
        "https://www.google.com/s2/favicons?domain={}&sz=64",
        host
    ));

    for candidate in candidates {
        if let Some((bytes, ext)) = fetch_image(&client, &candidate) {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Some(format!("data:{};base64,{}", mime_for(ext), b64));
        }
    }
    None
}

/// Cached favicon lookup. Caches negative results too, so a site with no
/// reachable icon costs one network attempt rather than one per render.
#[tauri::command]
pub fn get_favicon(url: String) -> Option<String> {
    ensure_dirs();
    let host = url
        .split('/')
        .nth(2)
        .unwrap_or("unknown")
        .replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-', "_");
    let cache = data_dir().join("favicons").join(format!("{}.txt", host));

    if let Ok(cached) = fs::read_to_string(&cache) {
        return if cached.is_empty() { None } else { Some(cached) };
    }

    let resolved = resolve_favicon(&url);
    let _ = fs::write(&cache, resolved.clone().unwrap_or_default());
    resolved
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
    
    let status = payload.get("status").and_then(|s| s.as_str()).unwrap_or("active").to_string();
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
        status,
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
        if let Some(status) = payload.get("status").and_then(|s| s.as_str()) {
            if !status.is_empty() {
                service.status = status.to_string();
            }
        }
    }
    
    save_toolbox(&tb);
    Ok(tb)
}

#[tauri::command]
pub fn archive_service(id: String) -> Result<ToolBox, String> {
    let mut tb = load_toolbox();
    if let Some(service) = tb.services.iter_mut().find(|s| s.id == id) {
        service.status = if service.status == "archived" {
            "active".into()
        } else {
            "archived".into()
        };
    }
    save_toolbox(&tb);
    Ok(tb)
}

#[tauri::command]
pub fn delete_service(id: String) -> Result<ToolBox, String> {
    let mut tb = load_toolbox();
    tb.services.retain(|s| s.id != id);
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

#[tauri::command]
pub fn add_category(label: String) -> Result<ToolBox, String> {
    let mut tb = load_toolbox();
    let trimmed = label.trim().to_string();
    if trimmed.is_empty() {
        return Err("Label cannot be empty".into());
    }
    // Auto-generate a slug id from the label
    let id: String = trimmed
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let id = if id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        id
    };
    // Ensure id uniqueness by appending a suffix if needed
    let id = if tb.categories.iter().any(|c| c.id == id) {
        format!("{}-{}", id, &uuid::Uuid::new_v4().to_string()[..4])
    } else {
        id
    };
    tb.categories.push(Category { id, label: trimmed });
    save_toolbox(&tb);
    Ok(tb)
}

#[tauri::command]
pub fn delete_category(id: String) -> Result<ToolBox, String> {
    let mut tb = load_toolbox();
    tb.categories.retain(|c| c.id != id);
    // Clear the category field on services that used this category
    for service in tb.services.iter_mut() {
        if service.category.as_deref() == Some(&id) {
            service.category = None;
        }
    }
    save_toolbox(&tb);
    Ok(tb)
}

#[tauri::command]
pub fn export_data(path: String) -> Result<(), String> {
    let tb = load_toolbox();
    let json = serde_json::to_string_pretty(&tb).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Could not write export file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn import_data(path: String) -> Result<ToolBox, String> {
    let raw = fs::read_to_string(&path).map_err(|e| format!("Could not read import file: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Not valid JSON: {e}"))?;
    if value.get("services").and_then(|v| v.as_array()).is_none() {
        return Err("Import file has no “services” list".into());
    }
    if value.get("categories").and_then(|v| v.as_array()).is_none() {
        return Err("Import file has no “categories” list".into());
    }
    let tb: ToolBox = serde_json::from_value(value)
        .map_err(|e| format!("Not a valid ToolBox backup: {e}"))?;
    save_toolbox(&tb);
    // reload so the default categories migration runs on the imported data
    Ok(load_toolbox())
}
