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

const MAX_EXPORT_LINES: usize = 250_000;
const MAX_EXPORT_LINE_BYTES: usize = 32_768;
const MAX_EXPORT_TOTAL_BYTES: usize = 64 * 1024 * 1024;
const PROGRESS_INTERVAL: usize = 250;

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

#[derive(Debug)]
struct TraversalOutcome {
    scanned_count: usize,
    result_count: usize,
    skipped_count: usize,
    cancelled: bool,
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

fn should_emit_progress(scanned_count: usize, last_progress: usize) -> bool {
    scanned_count.saturating_sub(last_progress) >= PROGRESS_INTERVAL
}

fn traverse_filesystem<FProgress, FBatch>(
    canonical_root: PathBuf,
    tokens: &[String],
    batch_size: usize,
    max_results: usize,
    cancelled: &AtomicBool,
    mut on_progress: FProgress,
    mut on_batch: FBatch,
) -> TraversalOutcome
where
    FProgress: FnMut(usize),
    FBatch: FnMut(Vec<FileEntry>, usize),
{
    let mut queue = VecDeque::from([canonical_root]);
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
            if should_emit_progress(scanned_count, last_progress) {
                last_progress = scanned_count;
                on_progress(scanned_count);
            }

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
            if !matches_name(&name, tokens) {
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
                on_batch(items, scanned_count);
            }

            if result_count >= max_results {
                queue.clear();
                break;
            }
        }
    }

    if !batch.is_empty() {
        let items = std::mem::take(&mut batch);
        on_batch(items, scanned_count);
    }

    TraversalOutcome {
        scanned_count,
        result_count,
        skipped_count,
        cancelled: cancelled.load(Ordering::Relaxed),
    }
}

fn validate_export_lines(lines: &[String]) -> Result<usize, String> {
    if lines.len() > MAX_EXPORT_LINES {
        return Err("Zu viele Zeilen für einen einzelnen Export.".into());
    }

    let mut total_bytes = 0usize;
    for line in lines {
        let line_bytes = line.len();
        if line_bytes > MAX_EXPORT_LINE_BYTES {
            return Err("Eine Exportzeile ist ungewöhnlich groß.".into());
        }
        total_bytes = total_bytes
            .checked_add(line_bytes.saturating_add(1))
            .ok_or_else(|| "Die Exportgröße ist zu groß.".to_string())?;
        if total_bytes > MAX_EXPORT_TOTAL_BYTES {
            return Err("Die Trefferliste ist für einen einzelnen Export zu groß.".into());
        }
    }

    Ok(total_bytes)
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
        let outcome = traverse_filesystem(
            canonical_root,
            &tokens,
            batch_size,
            max_results,
            &cancelled,
            |scanned_count| {
                let _ = app_for_thread.emit(
                    "search-progress",
                    SearchProgressPayload {
                        session_id: id_for_thread.clone(),
                        scanned_count,
                    },
                );
            },
            |items, scanned_count| {
                let _ = app_for_thread.emit(
                    "search-batch",
                    SearchBatchPayload {
                        session_id: id_for_thread.clone(),
                        items,
                        scanned_count,
                    },
                );
            },
        );

        if outcome.cancelled {
            let _ = app_for_thread.emit(
                "search-cancelled",
                SearchCancelledPayload {
                    session_id: id_for_thread.clone(),
                },
            );
        } else {
            let _ = app_for_thread.emit(
                "search-finished",
                SearchFinishedPayload {
                    session_id: id_for_thread.clone(),
                    scanned_count: outcome.scanned_count,
                    result_count: outcome.result_count,
                    skipped_count: outcome.skipped_count,
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
    let total_bytes = validate_export_lines(&lines)?;

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

    let header = "DateiFinder Trefferliste\n======================\n";
    let mut text = String::with_capacity(header.len().saturating_add(total_bytes));
    text.push_str(header);
    for line in lines {
        text.push_str(&line);
        text.push('\n');
    }

    fs::write(path, text)
        .map(|_| true)
        .map_err(|error| format!("Liste konnte nicht gespeichert werden: {error}"))
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

#[cfg(test)]
mod tests {
    use super::{
        canonical_child, classify, matches_name, normalize_query, should_emit_progress,
        traverse_filesystem, validate_export_lines, validated_allowed_file, AllowedRoots,
        MAX_EXPORT_TOTAL_BYTES,
    };
    use std::{
        collections::HashSet,
        fs,
        path::{Path, PathBuf},
        sync::atomic::AtomicBool,
        time::SystemTime,
    };

    fn temp_test_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dateifinder-{name}-{nonce}"));
        fs::create_dir_all(&path).expect("create temp test dir");
        path
    }

    struct TempTree {
        path: PathBuf,
        restricted: Vec<PathBuf>,
    }

    impl TempTree {
        fn new(name: &str) -> Self {
            Self {
                path: temp_test_dir(name),
                restricted: Vec::new(),
            }
        }

        #[cfg(unix)]
        fn restrict(&mut self, path: &Path) {
            use std::os::unix::fs::PermissionsExt;

            fs::set_permissions(path, fs::Permissions::from_mode(0o000))
                .expect("restrict fixture directory");
            self.restricted.push(path.to_path_buf());
        }
    }

    impl Drop for TempTree {
        fn drop(&mut self) {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;

                for path in &self.restricted {
                    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
                }
            }
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn tokenizes_and_matches_all_terms() {
        let tokens = normalize_query("Urlaub 2025");
        assert!(matches_name("Urlaub_2025_Berlin.jpg", &tokens));
        assert!(!matches_name("Urlaub_Berlin.jpg", &tokens));
    }

    #[test]
    fn matcher_stays_stable_under_large_input_volume() {
        let tokens = normalize_query("urlaub 2025");
        let matches = (0..100_000)
            .filter(|index| matches_name(&format!("urlaub_2025_{index}.jpg"), &tokens))
            .count();
        assert_eq!(matches, 100_000);
    }

    #[test]
    fn real_filesystem_traversal_handles_large_tree_without_escape_or_duplicates() {
        let mut root = TempTree::new("g4-root");
        let outside = TempTree::new("g4-outside");
        let canonical_root = root.path.canonicalize().expect("canonical fixture root");

        let mut deep = root.path.clone();
        for level in 0..6 {
            deep = deep.join(format!("level-{level}"));
            fs::create_dir_all(&deep).expect("create deep fixture path");
        }

        let mut buckets = Vec::new();
        for bucket in 0..20 {
            let path = deep.join(format!("bucket-{bucket:02}"));
            fs::create_dir_all(&path).expect("create fixture bucket");
            buckets.push(path);
        }
        fs::create_dir_all(root.path.join("empty-directory")).expect("create empty directory");

        let mut expected_matches = HashSet::new();
        for index in 0..10_000usize {
            let directory = &buckets[index % buckets.len()];
            let matching = index % 2 == 0;
            let name = if index == 0 {
                "ziel ünicode datei mit leerzeichen 00000.txt".to_string()
            } else if matching {
                format!("ziel_match_{index:05}.txt")
            } else {
                format!("other_{index:05}.txt")
            };
            let path = directory.join(name);
            let contents: &[u8] = if index % 3 == 0 { b"" } else { b"x" };
            fs::write(&path, contents).expect("write fixture file");
            if matching {
                expected_matches.insert(path);
            }
        }
        assert_eq!(expected_matches.len(), 5_000);

        let unreadable = root.path.join("permission-denied");
        fs::create_dir_all(&unreadable).expect("create permission fixture");
        fs::write(unreadable.join("other_hidden.txt"), b"hidden")
            .expect("write permission fixture file");

        #[cfg(unix)]
        let permission_case_active = {
            root.restrict(&unreadable);
            match fs::read_dir(&unreadable) {
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => true,
                other => {
                    eprintln!("G4 permission-denied case unsupported for this runner: {other:?}");
                    false
                }
            }
        };

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;

            symlink(&root.path, deep.join("cycle-link")).expect("create cycle symlink");
            fs::write(outside.path.join("ziel_outside_secret.txt"), b"outside")
                .expect("write outside fixture");
            symlink(&outside.path, deep.join("escape-link")).expect("create escape symlink");
        }

        let tokens = normalize_query("ziel");
        let cancelled = AtomicBool::new(false);
        let mut progress = Vec::new();
        let mut found = Vec::new();
        let outcome = traverse_filesystem(
            canonical_root.clone(),
            &tokens,
            137,
            250_000,
            &cancelled,
            |scanned_count| progress.push(scanned_count),
            |items, _scanned_count| found.extend(items),
        );

        assert!(!outcome.cancelled);
        assert!(outcome.scanned_count >= 10_000);
        assert_eq!(outcome.result_count, expected_matches.len());
        assert_eq!(found.len(), expected_matches.len());
        assert!(progress.windows(2).all(|window| window[0] < window[1]));
        assert!(progress
            .iter()
            .all(|scanned_count| *scanned_count <= outcome.scanned_count));

        let found_paths: HashSet<PathBuf> = found
            .iter()
            .map(|entry| PathBuf::from(&entry.path))
            .collect();
        assert_eq!(found_paths.len(), found.len());
        assert_eq!(found_paths, expected_matches);
        assert!(found_paths
            .iter()
            .all(|path| path.starts_with(&canonical_root)));

        #[cfg(unix)]
        if permission_case_active {
            assert!(outcome.skipped_count >= 3);
        } else {
            assert!(outcome.skipped_count >= 2);
        }
    }

    #[test]
    fn classification_is_case_insensitive() {
        assert_eq!(classify("JPG"), "image");
        assert_eq!(classify("Pdf"), "document");
        assert_eq!(classify("MP3"), "audio");
    }

    #[test]
    fn progress_is_independent_from_match_outcome() {
        assert!(!should_emit_progress(249, 0));
        assert!(should_emit_progress(250, 0));
        assert!(should_emit_progress(500, 250));
        assert!(!should_emit_progress(499, 250));
    }

    #[test]
    fn canonical_child_accepts_real_child_and_rejects_outside_file() {
        let root = temp_test_dir("canonical-root");
        let inside = root.join("inside.txt");
        fs::write(&inside, b"ok").expect("write inside");

        let outside_dir = temp_test_dir("canonical-outside");
        let outside = outside_dir.join("outside.txt");
        fs::write(&outside, b"no").expect("write outside");

        assert_eq!(
            canonical_child(&root, &inside).expect("inside allowed"),
            inside.canonicalize().expect("canonical inside")
        );
        assert!(canonical_child(&root, &outside).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn canonical_child_rejects_parent_traversal_escape() {
        let base = temp_test_dir("parent-traversal-base");
        let root = base.join("root");
        let nested = root.join("nested");
        let outside = base.join("outside");
        fs::create_dir_all(&nested).expect("create nested root");
        fs::create_dir_all(&outside).expect("create outside root");
        let secret = outside.join("secret.txt");
        fs::write(&secret, b"secret").expect("write outside file");

        let escaped = nested.join("..").join("..").join("outside").join("secret.txt");
        assert!(canonical_child(&root, &escaped).is_err());

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn canonical_child_accepts_unicode_path_inside_root() {
        let root = temp_test_dir("unicode-root");
        let unicode = root.join("Grüße_日本_ß Datei.txt");
        fs::write(&unicode, b"ok").expect("write unicode file");

        assert_eq!(
            canonical_child(&root, &unicode).expect("unicode child allowed"),
            unicode.canonicalize().expect("canonical unicode file")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn validated_allowed_file_rejects_unapproved_root() {
        let allowed = temp_test_dir("allowed-root");
        let foreign = temp_test_dir("foreign-root");
        let foreign_file = foreign.join("secret.txt");
        fs::write(&foreign_file, b"secret").expect("write foreign file");

        let allowed_roots = AllowedRoots::default();
        allowed_roots
            .0
            .lock()
            .expect("lock allowed roots")
            .insert(allowed.canonicalize().expect("canonical allowed root"));

        let foreign_root = foreign.to_string_lossy().into_owned();
        let foreign_path = foreign_file.to_string_lossy().into_owned();
        let error = validated_allowed_file(&allowed_roots, &foreign_root, &foreign_path)
            .expect_err("foreign root must be rejected");
        assert_eq!(error, "Der Suchort wurde in dieser Sitzung nicht freigegeben.");

        let _ = fs::remove_dir_all(allowed);
        let _ = fs::remove_dir_all(foreign);
    }

    #[test]
    fn validated_allowed_file_rejects_root_removed_after_approval() {
        let root = temp_test_dir("removed-approved-root");
        let file = root.join("file.txt");
        fs::write(&file, b"ok").expect("write fixture file");

        let allowed_roots = AllowedRoots::default();
        allowed_roots
            .0
            .lock()
            .expect("lock allowed roots")
            .insert(root.canonicalize().expect("canonical allowed root"));

        let root_path = root.to_string_lossy().into_owned();
        let file_path = file.to_string_lossy().into_owned();
        fs::remove_dir_all(&root).expect("remove approved root");

        let error = validated_allowed_file(&allowed_roots, &root_path, &file_path)
            .expect_err("removed approved root must be rejected");
        assert!(error.starts_with("Suchort ist nicht verfügbar:"));
    }

    #[test]
    fn validated_allowed_file_rejects_file_deleted_after_approval() {
        let root = temp_test_dir("deleted-approved-file");
        let file = root.join("file.txt");
        fs::write(&file, b"ok").expect("write fixture file");

        let allowed_roots = AllowedRoots::default();
        allowed_roots
            .0
            .lock()
            .expect("lock allowed roots")
            .insert(root.canonicalize().expect("canonical allowed root"));

        let root_path = root.to_string_lossy().into_owned();
        let file_path = file.to_string_lossy().into_owned();
        fs::remove_file(&file).expect("delete approved file");

        let error = validated_allowed_file(&allowed_roots, &root_path, &file_path)
            .expect_err("deleted approved file must be rejected");
        assert!(error.starts_with("Datei ist nicht verfügbar:"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn validated_allowed_file_rejects_file_moved_outside_approved_root() {
        let root = temp_test_dir("moved-approved-root");
        let outside = temp_test_dir("moved-approved-outside");
        let original = root.join("file.txt");
        let moved = outside.join("file.txt");
        fs::write(&original, b"ok").expect("write fixture file");

        let allowed_roots = AllowedRoots::default();
        allowed_roots
            .0
            .lock()
            .expect("lock allowed roots")
            .insert(root.canonicalize().expect("canonical allowed root"));

        let root_path = root.to_string_lossy().into_owned();
        let original_path = original.to_string_lossy().into_owned();
        fs::rename(&original, &moved).expect("move approved file outside root");

        let stale_error = validated_allowed_file(&allowed_roots, &root_path, &original_path)
            .expect_err("stale moved path must be rejected");
        assert!(stale_error.starts_with("Datei ist nicht verfügbar:"));

        let moved_path = moved.to_string_lossy().into_owned();
        let outside_error = validated_allowed_file(&allowed_roots, &root_path, &moved_path)
            .expect_err("moved outside file must be rejected");
        assert_eq!(
            outside_error,
            "Die Datei liegt außerhalb des freigegebenen Suchorts."
        );

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[cfg(unix)]
    #[test]
    fn canonical_child_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("symlink-root");
        let outside_dir = temp_test_dir("symlink-outside");
        let outside = outside_dir.join("secret.txt");
        fs::write(&outside, b"secret").expect("write outside");
        let link = root.join("escape.txt");
        symlink(&outside, &link).expect("create symlink");

        assert!(canonical_child(&root, &link).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn export_rejects_oversized_total_payload_before_allocation() {
        let line = "x".repeat(32_000);
        let count = (MAX_EXPORT_TOTAL_BYTES / (line.len() + 1)) + 2;
        let lines = vec![line; count];
        assert!(validate_export_lines(&lines).is_err());
    }

    #[test]
    fn export_accepts_reasonable_payload() {
        let lines = vec!["a\tb\t1".to_string(), "c\td\t2".to_string()];
        assert_eq!(validate_export_lines(&lines).expect("valid export"), 12);
    }
}
