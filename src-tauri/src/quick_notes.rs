//! Geschützter Einzeilenspeicher: nur ein festes Ziel, keine Pfadangabe aus der Oberfläche.
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

const NOTE_FILE: &str = "SCHNELLSPEICHER.txt";
const MAX_NOTE_BYTES: usize = 1024;

#[derive(Default)]
pub struct QuickNoteLock(pub Mutex<()>);

fn note_target(app: &AppHandle) -> Result<PathBuf, String> {
    // In der Entwicklung direkt im Projekt-Hauptverzeichnis, nicht in src-tauri.
    #[cfg(all(debug_assertions, not(mobile)))]
    {
        if let Some(root) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
            if root.join("package.json").is_file() && root.join("AGENTS.md").is_file() {
                return Ok(root.join(NOTE_FILE));
            }
        }
    }
    // Installierte Programme dürfen nicht in den meist schreibgeschützten Programmordner schreiben.
    let data_root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Lokales Datenverzeichnis nicht verfügbar: {error}"))?;
    fs::create_dir_all(&data_root)
        .map_err(|error| format!("Notizordner konnte nicht angelegt werden: {error}"))?;
    Ok(data_root.join(NOTE_FILE))
}

fn valid_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || !bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            10 => *byte == b'T',
            13 | 16 => *byte == b':',
            19 => *byte == b'.',
            23 => *byte == b'Z',
            _ => byte.is_ascii_digit(),
        })
    {
        return false;
    }

    // Ein ISO-Zeitstempel muss auch ein reales Kalenderdatum enthalten.
    let digits = |start: usize, end: usize| {
        bytes[start..end]
            .iter()
            .fold(0u32, |number, byte| number * 10 + u32::from(*byte - b'0'))
    };
    let year = digits(0, 4);
    let month = digits(5, 7);
    let day = digits(8, 10);
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day)
        && digits(11, 13) < 24
        && digits(14, 16) < 60
        && digits(17, 19) < 60
}

fn append_validated_line(path: &Path, note: &str, created_at: &str) -> Result<(), String> {
    let note = note.trim();
    if note.is_empty()
        || note.len() > MAX_NOTE_BYTES
        || note
            .chars()
            .any(|c| c.is_control() || c == '\u{2028}' || c == '\u{2029}')
    {
        return Err("Bitte eine einzeilige Notiz mit maximal 1.024 Byte eingeben.".into());
    }
    if !valid_timestamp(created_at) {
        return Err("Ungültiger Zeitstempel.".into());
    }

    // Bereits vorhandene symbolische Links nie als Schreibziel verwenden.
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("Notizdatei ist keine gewöhnliche Datei.".into());
        }
    }
    let mut file = fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|error| format!("Notizdatei konnte nicht geöffnet werden: {error}"))?;
    let line = format!("{created_at} | {note}\n");
    file.write_all(line.as_bytes())
        .map_err(|error| format!("Notiz konnte nicht angehängt werden: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Notiz konnte nicht dauerhaft gesichert werden: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn append_quick_note(
    app: AppHandle,
    lock: State<'_, QuickNoteLock>,
    note: String,
    created_at: String,
) -> Result<String, String> {
    let _write_guard = lock
        .0
        .lock()
        .map_err(|_| "Notizspeicher ist gesperrt.".to_string())?;
    let path = note_target(&app)?;
    append_validated_line(&path, &note, &created_at)?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::append_validated_line;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn quick_notes_append_without_replacing_existing_lines() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dateifinder-quick-{nonce}.txt"));
        append_validated_line(&path, "Erste Notiz", "2026-11-01T00:00:00.000Z").unwrap();
        append_validated_line(&path, "Zweite Notiz", "2026-11-01T00:00:01.000Z").unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert_eq!(content.lines().count(), 2);
        assert!(content.contains("Erste Notiz\n"));
        assert!(content.ends_with("Zweite Notiz\n"));
        assert!(
            append_validated_line(&path, "Trick\nNeue Zeile", "2026-11-01T00:00:02.000Z").is_err()
        );
        assert!(append_validated_line(&path, "  ", "2026-11-01T00:00:02.000Z").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), content);
        fs::remove_file(&path).unwrap();
    }

    #[test]
    fn invalid_calendar_timestamps_are_rejected_before_creating_a_note() {
        use super::valid_timestamp;

        for invalid in [
            "2026-00-01T12:00:00.000Z",
            "2026-13-01T12:00:00.000Z",
            "2026-02-29T12:00:00.000Z",
            "2024-04-31T12:00:00.000Z",
            "1900-02-29T12:00:00.000Z",
            "2026-11-00T12:00:00.000Z",
            "2026-11-01T24:00:00.000Z",
            "2026-11-01T23:60:00.000Z",
            "2026-11-01T23:59:60.000Z",
        ] {
            assert!(!valid_timestamp(invalid), "{invalid}");
        }
        for valid in [
            "2024-02-29T23:59:59.999Z",
            "2000-02-29T00:00:00.000Z",
            "2026-11-01T00:00:00.000Z",
        ] {
            assert!(valid_timestamp(valid), "{valid}");
        }

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dateifinder-invalid-date-{nonce}.txt"));
        assert!(append_validated_line(&path, "Notiz", "2026-99-99T99:99:99.999Z").is_err());
        assert!(
            !path.exists(),
            "ungueltiger Zeitstempel darf keine Datei anlegen"
        );
    }

    #[cfg(unix)]
    #[test]
    fn existing_symlink_is_not_followed() {
        use std::os::unix::fs::symlink;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("dateifinder-link-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("original.txt"), "unveraendert").unwrap();
        symlink(root.join("original.txt"), root.join("notes.txt")).unwrap();
        assert!(append_validated_line(
            &root.join("notes.txt"),
            "nicht speichern",
            "2026-11-01T00:00:00.000Z"
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(root.join("original.txt")).unwrap(),
            "unveraendert"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
