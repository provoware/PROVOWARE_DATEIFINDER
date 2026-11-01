//! Dateitransfers ausschließlich nach ausdrücklicher Wahl eines Zielordners.
//! Kein Überschreiben, kein Löschen einer Quelle vor erfolgreicher Zielprüfung.

use std::{
    collections::HashSet,
    ffi::OsString,
    fs::{self, File, Metadata, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};

pub(crate) const MAX_ACTION_FILES: usize = 100;
pub(crate) const MAX_ACTION_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const COPY_BUFFER_BYTES: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ActionKind {
    Copy,
    Move,
    Zip,
}

impl ActionKind {
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "copy" => Ok(Self::Copy),
            "move" => Ok(Self::Move),
            "zip" => Ok(Self::Zip),
            _ => Err("Unbekannte Dateiaktion.".into()),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ActionOutcome {
    pub completed: usize,
    pub destination: PathBuf,
}

pub(crate) struct ActionOptions<'a> {
    pub kind: ActionKind,
    pub archive_name: Option<&'a str>,
    pub session_id: &'a str,
}

// Fortschritt bleibt an logisch verarbeiteten Quelldaten orientiert. Dadurch
// werden Kopierversuche auf Ziellaufwerken ohne Hardlinks nicht doppelt gezählt.
struct ByteProgress<'a, F: FnMut(usize, usize, u64, u64, &str)> {
    emit: &'a mut F,
    completed: usize,
    total: usize,
    bytes_done: u64,
    bytes_total: u64,
    last_report: Instant,
}

impl<F: FnMut(usize, usize, u64, u64, &str)> ByteProgress<'_, F> {
    fn report(&mut self, phase: &str) {
        (self.emit)(
            self.completed,
            self.total,
            self.bytes_done,
            self.bytes_total,
            phase,
        );
        self.last_report = Instant::now();
    }

    fn advanced(&mut self, bytes: u64, phase: &str) {
        self.bytes_done = self.bytes_done.saturating_add(bytes).min(self.bytes_total);
        if self.last_report.elapsed() >= Duration::from_millis(200)
            || self.bytes_done == self.bytes_total
        {
            self.report(phase);
        }
    }

    fn file_finished(&mut self, phase: &str) {
        self.completed += 1;
        self.report(phase);
    }
}

struct CleanupPath {
    path: PathBuf,
    directory: bool,
    active: bool,
}

impl CleanupPath {
    fn file(path: PathBuf) -> Self {
        Self {
            path,
            directory: false,
            active: true,
        }
    }

    fn directory(path: PathBuf) -> Self {
        Self {
            path,
            directory: true,
            active: true,
        }
    }

    fn disarm(&mut self) {
        self.active = false;
    }
}

impl Drop for CleanupPath {
    fn drop(&mut self) {
        if !self.active {
            return;
        }
        if self.directory {
            let _ = fs::remove_dir_all(&self.path);
        } else {
            let _ = fs::remove_file(&self.path);
        }
    }
}

pub(crate) fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name == name.trim()
        && !name.starts_with('.')
        && !name.ends_with('.')
        && !name.chars().any(|character| {
            character.is_control()
                || matches!(character, '\u{061c}' | '\u{200e}' | '\u{200f}')
                || ('\u{2028}'..='\u{202e}').contains(&character)
                || ('\u{2066}'..='\u{206f}').contains(&character)
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
        })
}

pub(crate) fn valid_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("Abbruch: Fertige Dateien liegen im Ziel, übrige Originale bleiben erhalten.".into())
    } else {
        Ok(())
    }
}

fn compare_contents(source: &Path, copy: &Path, cancel: &AtomicBool) -> Result<bool, String> {
    let mut original =
        File::open(source).map_err(|error| format!("Quelle nicht lesbar: {error}"))?;
    let mut target = File::open(copy).map_err(|error| format!("Ziel nicht lesbar: {error}"))?;
    let mut left = [0u8; COPY_BUFFER_BYTES];
    let mut right = [0u8; COPY_BUFFER_BYTES];
    loop {
        cancelled(cancel)?;
        let length = original
            .read(&mut left)
            .map_err(|error| format!("Quellprüfung fehlgeschlagen: {error}"))?;
        if length > 0 {
            target
                .read_exact(&mut right[..length])
                .map_err(|error| format!("Zielprüfung fehlgeschlagen: {error}"))?;
        }
        if left[..length] != right[..length] {
            return Ok(false);
        }
        if length == 0 {
            return Ok(target
                .read(&mut right[..1])
                .map_err(|error| format!("Zielprüfung fehlgeschlagen: {error}"))?
                == 0);
        }
    }
}

fn copy_to_stage(
    source: &Path,
    target: &Path,
    cancel: &AtomicBool,
    mut on_bytes: impl FnMut(u64),
) -> Result<(), String> {
    let mut reader = File::open(source).map_err(|error| format!("Quelle nicht lesbar: {error}"))?;
    let mut writer = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| format!("Temporäres Ziel konnte nicht angelegt werden: {error}"))?;
    let mut cleanup = CleanupPath::file(target.to_path_buf());
    let mut buffer = [0u8; COPY_BUFFER_BYTES];
    loop {
        cancelled(cancel)?;
        let length = reader
            .read(&mut buffer)
            .map_err(|error| format!("Lesefehler: {error}"))?;
        if length == 0 {
            break;
        }
        writer
            .write_all(&buffer[..length])
            .map_err(|error| format!("Schreibfehler: {error}"))?;
        on_bytes(length as u64);
    }
    writer
        .sync_all()
        .map_err(|error| format!("Temporäres Ziel konnte nicht gesichert werden: {error}"))?;
    cleanup.disarm();
    Ok(())
}

#[cfg(unix)]
fn same_file_identity(before: &Metadata, after: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    before.dev() == after.dev()
        && before.ino() == after.ino()
        && before.len() == after.len()
        && before.mtime() == after.mtime()
        && before.mtime_nsec() == after.mtime_nsec()
        && before.ctime() == after.ctime()
        && before.ctime_nsec() == after.ctime_nsec()
}

#[cfg(not(unix))]
fn same_file_identity(before: &Metadata, after: &Metadata) -> bool {
    before.len() == after.len() && before.modified().ok() == after.modified().ok()
}

pub(crate) fn preflight_sources(
    root: &Path,
    sources: &[PathBuf],
) -> Result<Vec<(PathBuf, OsString, Metadata)>, String> {
    if sources.is_empty() || sources.len() > MAX_ACTION_FILES {
        return Err(format!("Bitte 1 bis {MAX_ACTION_FILES} Dateien auswählen."));
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Suchordner fehlt: {error}"))?;
    let mut names = HashSet::new();
    let mut paths = HashSet::new();
    let mut total_bytes = 0u64;
    let mut verified = Vec::with_capacity(sources.len());
    for source in sources {
        // Vor der Kanonisierung prüfen: sonst sieht ein interner Symlink
        // nach dem Auflösen wie eine reguläre Datei im freigegebenen Ordner aus.
        let original_type = fs::symlink_metadata(source)
            .map_err(|error| format!("Datei fehlt: {error}"))?
            .file_type();
        if original_type.is_symlink() {
            return Err(
                "Verknüpfungen und besondere Dateitypen können nicht verarbeitet werden.".into(),
            );
        }
        let path = source
            .canonicalize()
            .map_err(|error| format!("Datei fehlt: {error}"))?;
        if !path.starts_with(&canonical_root) || !path.is_file() {
            return Err("Mindestens eine Datei liegt außerhalb des freigegebenen Suchorts.".into());
        }
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Quelldatei nicht prüfbar: {error}"))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(
                "Verknüpfungen und besondere Dateitypen können nicht verarbeitet werden.".into(),
            );
        }
        let name = path
            .file_name()
            .ok_or("Ungültiger Dateiname.")?
            .to_os_string();
        if !names.insert(name.clone()) {
            return Err(
                "Zwei ausgewählte Dateien haben denselben Namen. Bitte getrennt übertragen.".into(),
            );
        }
        if !paths.insert(path.clone()) {
            return Err("Die gleiche Datei wurde mehrfach ausgewählt.".into());
        }
        total_bytes = total_bytes
            .checked_add(metadata.len())
            .ok_or("Dateiauswahl ist zu groß.")?;
        if total_bytes > MAX_ACTION_BYTES {
            return Err(
                "Die Auswahl überschreitet die Sicherheitsgrenze von 8 GB pro Aktion.".into(),
            );
        }
        verified.push((path, name, metadata));
    }
    Ok(verified)
}

fn unique_destination(destination: &Path, file_name: &std::ffi::OsStr) -> Result<PathBuf, String> {
    let path = destination.join(file_name);
    match fs::symlink_metadata(&path) {
        Ok(_) => Err(format!(
            "Am Ziel existiert bereits „{}“. Es wird nichts überschrieben.",
            file_name.to_string_lossy()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path),
        Err(error) => Err(format!("Ziel kann nicht geprüft werden: {error}")),
    }
}

// Auf Dateisystemen ohne Hardlinks (z. B. manchen USB-Sticks) bleibt
// create_new der Kollisionsschutz. Unvollständige Zieldateien werden entfernt.
fn commit_without_overwrite(
    staged: &Path,
    destination: &Path,
    cancel: &AtomicBool,
) -> Result<(), String> {
    cancelled(cancel)?;
    match fs::hard_link(staged, destination) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Err(
            "Am Ziel gibt es inzwischen eine Datei mit gleichem Namen. Nichts wurde überschrieben."
                .into(),
        ),
        Err(_) => {
            copy_to_stage(staged, destination, cancel, |_| {})?;
            let mut new_file_guard = CleanupPath::file(destination.to_path_buf());
            if !compare_contents(staged, destination, cancel)? {
                return Err(
                    "Nachprüfung am Ziellaufwerk fehlgeschlagen; unvollständige Kopie entfernt."
                        .into(),
                );
            }
            new_file_guard.disarm();
            Ok(())
        }
    }
}

fn transfer_one<F>(
    source: &Path,
    source_metadata: &Metadata,
    destination: &Path,
    staged: &Path,
    remove_original: bool,
    cancel: &AtomicBool,
    meter: &mut ByteProgress<'_, F>,
) -> Result<(), String>
where
    F: FnMut(usize, usize, u64, u64, &str),
{
    cancelled(cancel)?;
    let phase = if remove_original {
        "Datei wird verschoben"
    } else {
        "Datei wird kopiert"
    };
    meter.report(phase);
    copy_to_stage(source, staged, cancel, |bytes| meter.advanced(bytes, phase))?;
    let _cleanup = CleanupPath::file(staged.to_path_buf());
    if !compare_contents(source, staged, cancel)? {
        return Err(
            "Vorprüfung fehlgeschlagen: Quelle und temporäre Kopie unterscheiden sich.".into(),
        );
    }
    cancelled(cancel)?;
    // Gleicher Zielordner => hard_link ist ein atomarer, nicht überschreibender Commit.
    commit_without_overwrite(staged, destination, cancel)?;
    let mut new_file_guard = CleanupPath::file(destination.to_path_buf());
    if !compare_contents(source, destination, cancel)? {
        return Err(
            "Nachprüfung fehlgeschlagen. Die Quelldatei wurde nicht gelöscht; bitte Ziel prüfen."
                .into(),
        );
    }
    // Ab hier ist die Zielkopie gültig und bleibt selbst dann bestehen,
    // wenn die anschließende Quell-Löschung nicht gelingt.
    new_file_guard.disarm();
    if remove_original {
        cancelled(cancel)?;
        let current = fs::symlink_metadata(source)
            .map_err(|error| format!("Quelle kann nicht erneut geprüft werden: {error}"))?;
        if current.file_type().is_symlink() || !same_file_identity(source_metadata, &current) {
            return Err("Zielkopie ist vorhanden; die Quelle hat sich geändert und wurde daher nicht gelöscht.".into());
        }
        fs::remove_file(source).map_err(|error| {
            format!(
                "Zielkopie ist vorhanden, aber die Quelle konnte nicht entfernt werden: {error}"
            )
        })?;
    }
    Ok(())
}

fn wait_for_zip(mut child: Child, cancel: &AtomicBool) -> Result<(), String> {
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return cancelled(cancel);
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                return Err(format!("ZIP-Programm meldet einen Fehler ({status})."))
            }
            Ok(None) => thread::sleep(Duration::from_millis(80)),
            Err(error) => return Err(format!("ZIP-Programm konnte nicht geprüft werden: {error}")),
        }
    }
}

fn create_zip<F>(
    verified: &[(PathBuf, OsString, Metadata)],
    destination: &Path,
    archive_name: &str,
    session_id: &str,
    cancel: &AtomicBool,
    meter: &mut ByteProgress<'_, F>,
) -> Result<ActionOutcome, String>
where
    F: FnMut(usize, usize, u64, u64, &str),
{
    let _ = Command::new("zip").arg("-v").output().map_err(|_| {
        "ZIP benötigt das Programm „zip“. Unter Kubuntu: sudo apt install zip".to_string()
    })?;
    if !valid_name(archive_name) || !archive_name.to_ascii_lowercase().ends_with(".zip") {
        return Err("Bitte einen kurzen Archivnamen mit der Endung .zip angeben.".into());
    }
    let final_path = unique_destination(destination, std::ffi::OsStr::new(archive_name))?;
    let stage_root = destination.join(format!(".dateifinder-{session_id}-zip-staging"));
    fs::create_dir(&stage_root)
        .map_err(|error| format!("Temporärer ZIP-Ordner konnte nicht angelegt werden: {error}"))?;
    let _stage_dir_guard = CleanupPath::directory(stage_root.clone());
    let stage_dir = stage_root.join("inhalte");
    fs::create_dir(&stage_dir)
        .map_err(|error| format!("ZIP-Inhaltsordner konnte nicht angelegt werden: {error}"))?;
    let stage_archive = stage_root.join("archiv.zip");
    for (source, name, _metadata) in verified {
        let target = stage_dir.join(name);
        meter.report("ZIP: Dateien vorbereitet");
        copy_to_stage(source, &target, cancel, |bytes| {
            meter.advanced(bytes, "ZIP: Dateien vorbereitet");
        })?;
        if !compare_contents(source, &target, cancel)? {
            return Err("Vorprüfung einer Datei im ZIP-Arbeitsordner fehlgeschlagen.".into());
        }
        meter.file_finished("ZIP: Dateien vorbereitet");
    }
    cancelled(cancel)?;
    meter.report("ZIP: Archiv wird erstellt");
    let child = Command::new("zip")
        .arg("-q")
        .arg("-X")
        .arg("-r")
        .arg(&stage_archive)
        .arg(".")
        .current_dir(&stage_dir)
        .spawn()
        .map_err(|error| format!("ZIP konnte nicht gestartet werden: {error}"))?;
    wait_for_zip(child, cancel)?;
    meter.report("ZIP: Archiv wird geprüft");
    let child = Command::new("zip")
        .arg("-T")
        .arg(&stage_archive)
        .spawn()
        .map_err(|error| format!("ZIP-Prüfung konnte nicht starten: {error}"))?;
    wait_for_zip(child, cancel)?;
    cancelled(cancel)?;
    commit_without_overwrite(&stage_archive, &final_path, cancel)?;
    let mut final_guard = CleanupPath::file(final_path.clone());
    let length = fs::metadata(&final_path)
        .map_err(|error| format!("ZIP-Nachprüfung fehlgeschlagen: {error}"))?
        .len();
    if length == 0 {
        return Err("ZIP-Nachprüfung fehlgeschlagen: Archiv ist leer.".into());
    }
    if !compare_contents(&stage_archive, &final_path, cancel)? {
        return Err("ZIP-Nachprüfung fehlgeschlagen: Archiv am Ziel unterscheidet sich.".into());
    }
    final_guard.disarm();
    Ok(ActionOutcome {
        completed: verified.len(),
        destination: final_path,
    })
}

pub(crate) fn perform_file_action<F>(
    root: &Path,
    sources: &[PathBuf],
    destination: &Path,
    options: ActionOptions<'_>,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<ActionOutcome, String>
where
    F: FnMut(usize, usize, u64, u64, &str),
{
    if !valid_session_id(options.session_id) {
        return Err("Ungültige Aktionskennung.".into());
    }
    cancelled(cancel)?;
    let verified = preflight_sources(root, sources)?;
    let destination = destination
        .canonicalize()
        .map_err(|error| format!("Zielordner fehlt: {error}"))?;
    if !destination.is_dir() || fs::read_dir(&destination).is_err() {
        return Err("Zielordner ist nicht lesbar oder nicht verfügbar.".into());
    }
    let total = verified.len();
    let bytes_total = verified.iter().map(|(_, _, metadata)| metadata.len()).sum();
    let mut meter = ByteProgress {
        emit: &mut progress,
        completed: 0,
        total,
        bytes_done: 0,
        bytes_total,
        last_report: Instant::now(),
    };
    if options.kind == ActionKind::Zip {
        return create_zip(
            &verified,
            &destination,
            options.archive_name.unwrap_or("DateiFinder-Auswahl.zip"),
            options.session_id,
            cancel,
            &mut meter,
        );
    }
    // Vor der ersten Mutation alle Zieldateinamen auf Kollisionen prüfen.
    for (_source, name, _) in &verified {
        unique_destination(&destination, name)?;
    }
    let mut completed = 0usize;
    for (index, (source, name, metadata)) in verified.iter().enumerate() {
        if let Err(error) = cancelled(cancel) {
            return Err(format!(
                "{completed} von {total} Dateien abgeschlossen. {error}"
            ));
        }
        let final_path = unique_destination(&destination, name)?;
        let stage = destination.join(format!(".dateifinder-{}-{index}.tmp", options.session_id));
        if let Err(error) = transfer_one(
            source,
            metadata,
            &final_path,
            &stage,
            options.kind == ActionKind::Move,
            cancel,
            &mut meter,
        ) {
            return Err(format!(
                "{completed} von {total} Dateien abgeschlossen. {error}"
            ));
        }
        completed += 1;
        meter.file_finished(if options.kind == ActionKind::Move {
            "Dateien verschoben"
        } else {
            "Dateien kopiert"
        });
    }
    Ok(ActionOutcome {
        completed,
        destination,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dateifinder-action-tests-{nanos}"));
        fs::create_dir(&path).expect("create fixture");
        path
    }

    #[test]
    fn copy_preserves_source_and_checks_destination_contents() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("text.txt");
        fs::write(&source, "Originaldaten").expect("source");
        let result = perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Copy,
                archive_name: None,
                session_id: "test-copy",
            },
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        )
        .expect("copy");
        assert_eq!(result.completed, 1);
        assert_eq!(
            fs::read(&source).expect("source"),
            fs::read(dest.join("text.txt")).expect("target")
        );
        assert!(!dest.join(".dateifinder-test-copy-0.tmp").exists());
        fs::remove_dir_all(root).expect("cleanup test");
    }

    #[test]
    fn move_removes_source_only_after_verified_copy() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("text.txt");
        fs::write(&source, "Originaldaten").expect("source");
        perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Move,
                archive_name: None,
                session_id: "test-move",
            },
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        )
        .expect("move");
        assert!(!source.exists());
        assert_eq!(
            fs::read(dest.join("text.txt")).expect("target"),
            b"Originaldaten"
        );
        fs::remove_dir_all(root).expect("cleanup test");
    }

    #[test]
    fn collisions_and_cancelled_requests_leave_originals_unchanged() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("text.txt");
        fs::write(&source, "Quelle").expect("source");
        fs::write(dest.join("text.txt"), "Ziel bleibt").expect("existing target");
        assert!(perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Move,
                archive_name: None,
                session_id: "test-collision"
            },
            &AtomicBool::new(false),
            |_, _, _, _, _| {}
        )
        .is_err());
        assert_eq!(fs::read(&source).expect("source"), b"Quelle");
        assert_eq!(
            fs::read(dest.join("text.txt")).expect("target"),
            b"Ziel bleibt"
        );
        let flag = AtomicBool::new(true);
        assert!(perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Copy,
                archive_name: None,
                session_id: "test-cancel"
            },
            &flag,
            |_, _, _, _, _| {}
        )
        .is_err());
        assert_eq!(fs::read(&source).expect("source"), b"Quelle");
        fs::remove_dir_all(root).expect("cleanup test");
    }

    #[test]
    fn cancellation_after_first_file_reports_partial_commit_and_preserves_other_source() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let first = root.join("eins.txt");
        let second = root.join("zwei.txt");
        fs::write(&first, "Datei eins").expect("first");
        fs::write(&second, "Datei zwei").expect("second");
        let flag = AtomicBool::new(false);
        let result = perform_file_action(
            &root,
            &[first.clone(), second.clone()],
            &dest,
            ActionOptions {
                kind: ActionKind::Move,
                archive_name: None,
                session_id: "partial",
            },
            &flag,
            |count, _, _, _, _| {
                if count == 1 {
                    flag.store(true, Ordering::Relaxed);
                }
            },
        );
        assert!(result.expect_err("cancel expected").contains("1 von 2"));
        assert!(!first.exists());
        assert!(second.exists());
        assert_eq!(
            fs::read(dest.join("eins.txt")).expect("completed"),
            b"Datei eins"
        );
        assert!(!dest.join("zwei.txt").exists());
        assert!(!dest.join(".dateifinder-partial-1.tmp").exists());
        fs::remove_dir_all(root).expect("cleanup test");
    }

    #[test]
    fn duplicate_names_are_rejected_before_writing_any_destination() {
        let root = fixture();
        let dest = root.join("ziel");
        let first_dir = root.join("a");
        let second_dir = root.join("b");
        fs::create_dir(&dest).expect("dest");
        fs::create_dir(&first_dir).expect("a");
        fs::create_dir(&second_dir).expect("b");
        let first = first_dir.join("gleich.txt");
        let second = second_dir.join("gleich.txt");
        fs::write(&first, "eins").expect("first");
        fs::write(&second, "zwei").expect("second");
        let result = perform_file_action(
            &root,
            &[first.clone(), second.clone()],
            &dest,
            ActionOptions {
                kind: ActionKind::Copy,
                archive_name: None,
                session_id: "duplicate",
            },
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        );
        assert!(result.is_err());
        assert_eq!(fs::read_dir(&dest).expect("target").count(), 0);
        assert!(first.exists() && second.exists());
        fs::remove_dir_all(root).expect("cleanup test");
    }

    #[test]
    fn zip_archive_is_tested_and_stage_data_removed() {
        if Command::new("zip").arg("-v").output().is_err() {
            return;
        }
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("text.txt");
        fs::write(&source, "Archivinhalt").expect("source");
        let result = perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Zip,
                archive_name: Some("auswahl.zip"),
                session_id: "test-zip",
            },
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        )
        .expect("zip");
        assert_eq!(result.completed, 1);
        assert!(
            dest.join("auswahl.zip")
                .metadata()
                .expect("zip metadata")
                .len()
                > 0
        );
        assert!(source.exists());
        assert!(!dest.join(".dateifinder-test-zip-zip-staging").exists());
        fs::remove_dir_all(root).expect("cleanup test");
    }

    #[test]
    fn file_action_names_reject_invisible_layout_controls() {
        let controls = concat!(
            "\u{061c}\u{200e}\u{200f}",
            "\u{2028}\u{2029}\u{202a}\u{202b}\u{202c}\u{202d}\u{202e}",
            "\u{2066}\u{2067}\u{2068}\u{2069}\u{206a}\u{206b}\u{206c}\u{206d}\u{206e}\u{206f}",
        );
        for character in controls.chars() {
            assert!(!valid_name(&format!("archiv{character}2026.zip")));
        }
        assert!(valid_name("Büro 🧑‍💻.zip"));
    }

    #[test]
    fn archive_names_and_traversal_are_rejected() {
        assert!(!valid_name("../z.zip"));
        assert!(!valid_name("x\\z.zip"));
        assert!(!valid_session_id("../../outside"));
        let root = fixture();
        let outside = fixture();
        let source = outside.join("secret.txt");
        fs::write(&source, "secret").expect("source");
        let result = perform_file_action(
            &root,
            &[source],
            &root,
            ActionOptions {
                kind: ActionKind::Copy,
                archive_name: None,
                session_id: "test-escape",
            },
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        );
        assert!(result.is_err());
        fs::remove_dir_all(root).expect("cleanup root");
        fs::remove_dir_all(outside).expect("cleanup outside");
    }

    #[test]
    fn interrupt_mid_write_removes_incomplete_temp_and_preserves_original() {
        let root = fixture();
        let original = root.join("original.dat");
        let stage = root.join(".dateifinder-interrupted.tmp");
        let data = vec![42u8; COPY_BUFFER_BYTES * 3];
        fs::write(&original, &data).expect("fixture bytes");
        let cancel = AtomicBool::new(false);
        let result = copy_to_stage(&original, &stage, &cancel, |bytes| {
            assert!(bytes > 0);
            cancel.store(true, Ordering::Relaxed);
        });
        assert!(result.is_err());
        assert!(!stage.exists());
        assert_eq!(fs::read(&original).expect("unchanged source"), data);
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn source_change_during_copy_prevents_move_and_cleans_staging() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("updated.txt");
        let before = vec![b'a'; COPY_BUFFER_BYTES * 2];
        let changed = vec![b'z'; COPY_BUFFER_BYTES * 2];
        fs::write(&source, &before).expect("original");
        let mut injected = false;
        let result = perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Move,
                archive_name: None,
                session_id: "source-change",
            },
            &AtomicBool::new(false),
            |_, _, done, total, _| {
                if !injected && done == total {
                    injected = true;
                    fs::write(&source, &changed).expect("controlled source change");
                }
            },
        );
        assert!(injected);
        assert!(result.is_err());
        assert_eq!(
            fs::read(&source).expect("preserved changed source"),
            changed
        );
        assert!(!dest.join("updated.txt").exists());
        assert!(!dest.join(".dateifinder-source-change-0.tmp").exists());
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn collision_appearing_after_preflight_never_overwrites_other_data() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("fremd.txt");
        fs::write(&source, vec![3u8; COPY_BUFFER_BYTES]).expect("source");
        let destination = dest.join("fremd.txt");
        let mut injected = false;
        let result = perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            ActionOptions {
                kind: ActionKind::Move,
                archive_name: None,
                session_id: "collision-race",
            },
            &AtomicBool::new(false),
            |_, _, done, total, _| {
                if !injected && done == total {
                    injected = true;
                    fs::write(&destination, "Nicht überschreiben").expect("collision injection");
                }
            },
        );
        assert!(injected);
        assert!(result.is_err());
        assert!(source.exists());
        assert_eq!(
            fs::read(&destination).expect("other data"),
            "Nicht überschreiben".as_bytes()
        );
        assert!(!dest.join(".dateifinder-collision-race-0.tmp").exists());
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn old_temporary_file_is_preserved_and_manual_retry_is_safe() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let source = root.join("quelle.txt");
        fs::write(&source, "Original").expect("source");
        let stale = dest.join(".dateifinder-retry-0.tmp");
        fs::write(&stale, "Vorhandene Zwischenablage").expect("old stage");
        let options = || ActionOptions {
            kind: ActionKind::Copy,
            archive_name: None,
            session_id: "retry",
        };
        let first = perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            options(),
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        );
        assert!(first.is_err());
        assert_eq!(
            fs::read(&stale).expect("old stage untouched"),
            b"Vorhandene Zwischenablage"
        );
        assert_eq!(fs::read(&source).expect("source"), b"Original");
        assert!(!dest.join("quelle.txt").exists());

        // Nur das Testfixture bereinigt die simulierte Altdatei. Die App
        // löscht unbekannte Altdateien niemals automatisch.
        fs::remove_file(&stale).expect("manual cleanup");
        let retry = perform_file_action(
            &root,
            std::slice::from_ref(&source),
            &dest,
            options(),
            &AtomicBool::new(false),
            |_, _, _, _, _| {},
        );
        assert_eq!(retry.expect("retry").completed, 1);
        assert_eq!(
            fs::read(dest.join("quelle.txt")).expect("copy"),
            b"Original"
        );
        assert_eq!(
            fs::read(&source).expect("original still present"),
            b"Original"
        );
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[test]
    fn byte_progress_is_bounded_monotonic_and_finishes_at_total() {
        let root = fixture();
        let dest = root.join("ziel");
        fs::create_dir(&dest).expect("destination");
        let first = root.join("eins.dat");
        let second = root.join("zwei.dat");
        fs::write(&first, vec![1u8; COPY_BUFFER_BYTES + 10]).expect("first");
        fs::write(&second, vec![2u8; COPY_BUFFER_BYTES * 2]).expect("second");
        let mut events = Vec::new();
        let outcome = perform_file_action(
            &root,
            &[first, second],
            &dest,
            ActionOptions {
                kind: ActionKind::Copy,
                archive_name: None,
                session_id: "byte-progress",
            },
            &AtomicBool::new(false),
            |completed, total, bytes_done, bytes_total, _| {
                events.push((completed, total, bytes_done, bytes_total));
            },
        );
        assert_eq!(outcome.expect("both files copied").completed, 2);
        assert!(!events.is_empty());
        let expected = (COPY_BUFFER_BYTES * 3 + 10) as u64;
        assert!(events.iter().all(|(count, total, done, bytes)| {
            *count <= *total && *total == 2 && *done <= *bytes && *bytes == expected
        }));
        assert!(events.windows(2).all(|pair| pair[0].2 <= pair[1].2));
        assert_eq!(events.last().map(|event| event.2), Some(expected));
        fs::remove_dir_all(root).expect("cleanup fixture");
    }

    #[cfg(unix)]
    #[test]
    fn preflight_rejects_internal_source_symlink_before_canonicalization() {
        use std::os::unix::fs::symlink;

        let root = fixture();
        let original = root.join("original.txt");
        let link = root.join("auswahl.txt");
        fs::write(&original, "Originaldaten").expect("original");
        symlink(&original, &link).expect("internal symlink");

        assert!(preflight_sources(&root, std::slice::from_ref(&original)).is_ok());
        let error = preflight_sources(&root, std::slice::from_ref(&link))
            .expect_err("internal symlink must be rejected");
        assert!(error.contains("Verknüpfungen"), "{error}");
        assert_eq!(
            fs::read(&original).expect("original intact"),
            b"Originaldaten"
        );
        fs::remove_dir_all(root).expect("cleanup fixture");
    }
}
