use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet, VecDeque},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Instant, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Default)]
pub struct SearchRegistry(pub Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>);

#[derive(Clone, Default)]
pub struct AllowedRoots(pub Arc<Mutex<HashSet<PathBuf>>>);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub session_id: String,
    pub root_path: String,
    pub query: String,
    pub batch_size: usize,
    pub max_results: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub display_name: String,
    pub path: String,
    pub extension: String,
    pub size_bytes: u64,
    pub modified_at: Option<u128>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchBatchPayload {
    pub session_id: String,
    pub items: Vec<FileEntry>,
    pub scanned_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProgressPayload {
    pub session_id: String,
    pub scanned_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFinishedPayload {
    pub session_id: String,
    pub scanned_count: usize,
    pub result_count: usize,
    pub skipped_count: usize,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCancelledPayload {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: String,
    pub can_pick_folder: bool,
    pub can_open_file: bool,
    pub can_reveal_file: bool,
    pub can_search_recursively: bool,
    pub supports_picked_files: bool,
}

fn normalize_query(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(|token| token.to_lowercase())
        .filter(|token| !token.is_empty())
        .collect()
}

fn matches_name(name: &str, tokens: &[String]) -> bool {
    if tokens.is_empty() {
        return true;
    }
    let normalized = name.to_lowercase();
    tokens.iter().all(|token| normalized.contains(token))
}

fn classify(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tif" | "tiff" | "svg" => "image",
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" => "audio",
        "pdf" | "doc" | "docx" | "odt" | "xls" | "xlsx" | "ods" | "ppt" | "pptx" => "document",
        _ => "text",
    }
}

fn stable_id(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn file_entry(path: &Path, metadata: &fs::Metadata) -> FileEntry {
    let display_name = path
        .file_name()
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_default();
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis());

    FileEntry {
        id: stable_id(path),
        display_name,
        path: path.to_string_lossy().into_owned(),
        extension: extension.clone(),
        size_bytes: metadata.len(),
        modified_at,
        kind: classify(&extension).to_string(),
    }
}

fn canonical_child(root: &Path, child: &Path) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("Suchort ist nicht verfügbar: {error}"))?;
    let child = child
        .canonicalize()
        .map_err(|error| format!("Datei ist nicht verfügbar: {error}"))?;
    if !child.starts_with(&root) {
        return Err("Die Datei liegt außerhalb des freigegebenen Suchorts.".into());
    }
    Ok(child)
}

#[tauri::command]
fn platform_capabilities() -> PlatformCapabilities {
    let mobile = cfg!(any(target_os = "android", target_os = "ios"));
    PlatformCapabilities {
        platform: std::env::consts::OS.to_string(),
        can_pick_folder: !mobile,
        can_open_file: !mobile,
        can_reveal_file: !mobile,
        can_search_recursively: !mobile,
        supports_picked_files: mobile,
    }
}

#[tauri::command]
async fn pick_search_root(
    app: AppHandle,
    allowed_roots: State<'_, AllowedRoots>,
) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Suchordner auswählen")
        .blocking_pick_folder();

    let Some(selected) = selected else {
        return Ok(None);
    };

    let path = selected
        .into_path()
        .map_err(|error| format!("Der gewählte Suchort ist kein lokaler Pfad: {error}"))?;
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Suchort kann nicht geöffnet werden: {error}"))?;

    if !canonical.is_dir() {
        return Err("Der gewählte Suchort ist kein Ordner.".into());
    }

    let mut roots = allowed_roots
        .0
        .lock()
        .map_err(|_| "Interner Berechtigungsstatus ist blockiert.".to_string())?;
    if roots.len() >= 64 && !roots.contains(&canonical) {
        return Err("Zu viele Suchorte in dieser Sitzung. Bitte DateiFinder neu starten.".into());
    }
    roots.insert(canonical);

    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn start_search(
    app: AppHandle,
    registry: State<'_, SearchRegistry>,
    allowed_roots: State<'_, AllowedRoots>,
    request: SearchRequest,
) -> Result<(), String> {
    if request.root_path.trim().is_empty() {
        return Err("Kein Suchort angegeben.".into());
    }

    let root = PathBuf::from(&request.root_path);
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Suchort kann nicht geöffnet werden: {error}"))?;

    if !canonical_root.is_dir() {
        return Err("Der gewählte Suchort ist kein Ordner.".into());
    }

    let is_allowed = allowed_roots
        .0
        .lock()
        .map_err(|_| "Interner Berechtigungsstatus ist blockiert.".to_string())?
        .contains(&canonical_root);
    if !is_allowed {
        return Err("Der Suchort wurde in dieser Sitzung nicht freigegeben.".into());
    }

    let batch_size = request.batch_size.clamp(10, 500);
    let max_results = request.max_results.clamp(1, 250_000);
    let tokens = normalize_query(&request.query);
    let id = request.session_id.trim().to_string();
    if id.is_empty() || id.len() > 128 {
        return Err("Ungültige Suchsitzung.".into());
    }

    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut sessions = registry
            .0
            .lock()
            .map_err(|_| "Interner Suchstatus ist blockiert.".to_string())?;
        if sessions.contains_key(&id) {
            return Err("Diese Suchsitzung existiert bereits.".into());
        }
        sessions.insert(id.clone(), cancelled.clone());
    }

    let app_for_thread = app.clone();
    let registry_for_thread = app.state::<SearchRegistry>().inner().clone();
    let id_for_thread = id.clone();

    std::thread::spawn(move || {
        let started = Instant::now();
        let mut queue = VecDeque::from([root]);
        let mut batch = Vec::with_capacity(batch_size);
        let mut scanned_count = 0usize;
        let mut result_count = 0usize;
        let mut skipped_count = 0usize;
        let mut last_progress = 0usize;

        while let Some(directory) = queue.pop_front() {
            if cancelled.load(Ordering::Relaxed) {
                break;
            }

            let entries = match fs::read_dir(&directory) {
                Ok(entries) => entries,
                Err(_) => {
                    skipped_count += 1;
                    continue;
                }
            };

            for entry in entries {
                if cancelled.load(Ordering::Relaxed) {
                    break;
                }

                let entry = match entry {
                    Ok(entry) => entry,
                    Err(_) => {
                        skipped_count += 1;
                        continue;
                    }
                };

                scanned_count += 1;
                let file_type = match entry.file_type() {
                    Ok(kind) => kind,
                    Err(_) => {
                        skipped_count += 1;
                        continue;
                    }
                };

                if file_type.is_symlink() {
                    skipped_count += 1;
                    continue;
                }
                if file_type.is_dir() {
                    queue.push_back(entry.path());
                    continue;
                }
                if !file_type.is_file() {
                    continue;
                }

                let name = entry.file_name().to_string_lossy().into_owned();
                if !matches_name(&name, &tokens) {
                    if scanned_count.saturating_sub(last_progress) >= 250 {
                        last_progress = scanned_count;
                        let _ = app_for_thread.emit(
                            "search-progress",
                            SearchProgressPayload {
                                session_id: id_for_thread.clone(),
                                scanned_count,
                            },
                        );
                    }
                    continue;
                }

                let metadata = match entry.metadata() {
                    Ok(metadata) => metadata,
                    Err(_) => {
                        skipped_count += 1;
                        continue;
                    }
                };

                batch.push(file_entry(&entry.path(), &metadata));
                result_count += 1;

                if batch.len() >= batch_size {
                    let items = std::mem::take(&mut batch);
                    let _ = app_for_thread.emit(
                        "search-batch",
                        SearchBatchPayload {
                            session_id: id_for_thread.clone(),
                            items,
                            scanned_count,
                        },
                    );
                }

                if result_count >= max_results {
                    queue.clear();
                    break;
                }
            }
        }

        if cancelled.load(Ordering::Relaxed) {
            let _ = app_for_thread.emit(
                "search-cancelled",
                SearchCancelledPayload {
                    session_id: id_for_thread.clone(),
                },
            );
        } else {
            if !batch.is_empty() {
                let _ = app_for_thread.emit(
                    "search-batch",
                    SearchBatchPayload {
                        session_id: id_for_thread.clone(),
                        items: batch,
                        scanned_count,
                    },
                );
            }
            let _ = app_for_thread.emit(
                "search-finished",
                SearchFinishedPayload {
                    session_id: id_for_thread.clone(),
                    scanned_count,
                    result_count,
                    skipped_count,
                    duration_ms: started.elapsed().as_millis(),
                },
            );
        }

        if let Ok(mut sessions) = registry_for_thread.0.lock() {
            sessions.remove(&id_for_thread);
        }
    });

    Ok(())
}

#[tauri::command]
fn cancel_search(registry: State<'_, SearchRegistry>, session_id: String) -> Result<(), String> {
    let sessions = registry
        .0
        .lock()
        .map_err(|_| "Interner Suchstatus ist blockiert.".to_string())?;
    if let Some(cancelled) = sessions.get(&session_id) {
        cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}

fn validated_allowed_file(
    allowed_roots: &AllowedRoots,
    root_path: &str,
    path: &str,
) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("Suchort ist nicht verfügbar: {error}"))?;

    let is_allowed = allowed_roots
        .0
        .lock()
        .map_err(|_| "Interner Berechtigungsstatus ist blockiert.".to_string())?
        .contains(&root);
    if !is_allowed {
        return Err("Der Suchort wurde in dieser Sitzung nicht freigegeben.".into());
    }

    let validated = canonical_child(&root, Path::new(path))?;
    if !validated.is_file() {
        return Err("Die ausgewählte Datei ist nicht mehr vorhanden.".into());
    }
    Ok(validated)
}

#[tauri::command]
fn open_file(
    app: AppHandle,
    allowed_roots: State<'_, AllowedRoots>,
    root_path: String,
    path: String,
) -> Result<(), String> {
    let file = validated_allowed_file(&allowed_roots, &root_path, &path)?;
    app.opener()
        .open_path(file.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("Datei konnte nicht geöffnet werden: {error}"))
}

#[tauri::command]
fn reveal_file(
    app: AppHandle,
    allowed_roots: State<'_, AllowedRoots>,
    root_path: String,
    path: String,
) -> Result<(), String> {
    let file = validated_allowed_file(&allowed_roots, &root_path, &path)?;
    app.opener()
        .reveal_item_in_dir(&file)
        .map_err(|error| format!("Datei konnte nicht im Dateimanager angezeigt werden: {error}"))
}

#[tauri::command]
async fn export_results(app: AppHandle, lines: Vec<String>) -> Result<bool, String> {
    if lines.len() > 250_000 {
        return Err("Zu viele Zeilen für einen einzelnen Export.".into());
    }
    if lines.iter().any(|line| line.len() > 32_768) {
        return Err("Eine Exportzeile ist ungewöhnlich groß.".into());
    }

    let selected = app
        .dialog()
        .file()
        .set_title("Trefferliste speichern")
        .set_file_name("dateifinder-ergebnisse.txt")
        .add_filter("Textdatei", &["txt"])
        .blocking_save_file();

    let Some(selected) = selected else {
        return Ok(false);
    };

    let path = selected
        .into_path()
        .map_err(|error| format!("Exportziel ist kein lokaler Pfad: {error}"))?;

    let mut text = String::from("DateiFinder Trefferliste\n======================\n");
    for line in lines {
        text.push_str(&line);
        text.push('\n');
    }

    fs::write(path, text)
        .map(|_| true)
        .map_err(|error| format!("Liste konnte nicht gespeichert werden: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{classify, matches_name, normalize_query};

    #[test]
    fn tokenizes_and_matches_all_terms() {
        let tokens = normalize_query("Urlaub 2025");
        assert!(matches_name("Urlaub_2025_Berlin.jpg", &tokens));
        assert!(!matches_name("Urlaub_Berlin.jpg", &tokens));
    }

    #[test]
    fn classification_is_case_insensitive() {
        assert_eq!(classify("JPG"), "image");
        assert_eq!(classify("Pdf"), "document");
        assert_eq!(classify("MP3"), "audio");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SearchRegistry::default())
        .manage(AllowedRoots::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            start_search,
            cancel_search,
            platform_capabilities,
            pick_search_root,
            open_file,
            reveal_file,
            export_results,
        ])
        .run(tauri::generate_context!())
        .expect("DateiFinder konnte nicht gestartet werden");
}
