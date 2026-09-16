#![allow(unexpected_cfgs)]
#![cfg(g5_contract)]

mod app_under_test {
    #![allow(dead_code)]

    include!("../src/lib.rs");

    pub(super) fn canonical_child_probe(
        root: &std::path::Path,
        child: &std::path::Path,
    ) -> Result<std::path::PathBuf, String> {
        canonical_child(root, child)
    }

    pub(super) fn validated_allowed_file_probe(
        allowed_roots: &AllowedRoots,
        root_path: &str,
        path: &str,
    ) -> Result<std::path::PathBuf, String> {
        validated_allowed_file(allowed_roots, root_path, path)
    }

    pub(super) fn validate_export_probe(lines: &[String]) -> Result<usize, String> {
        validate_export_lines(lines)
    }

    pub(super) fn export_limits() -> (usize, usize, usize) {
        (
            MAX_EXPORT_LINES,
            MAX_EXPORT_LINE_BYTES,
            MAX_EXPORT_TOTAL_BYTES,
        )
    }
}

#[cfg(test)]
mod g5_security_tests {
    use super::app_under_test::{
        canonical_child_probe, export_limits, validate_export_probe, validated_allowed_file_probe,
        AllowedRoots,
    };
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("dateifinder-g5-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create G5 temp directory");
            Self { path }
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn as_text(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    fn register_root(allowed_roots: &AllowedRoots, root: &Path) {
        allowed_roots
            .0
            .lock()
            .expect("allowed roots lock")
            .insert(root.canonicalize().expect("canonical root"));
    }

    #[test]
    fn g5_parent_segments_cannot_escape_root() {
        let root = TempDir::new("dotdot-root");
        let outside = TempDir::new("dotdot-outside");
        let secret = outside.path.join("secret.txt");
        fs::write(&secret, b"secret").expect("write outside file");

        let outside_name = outside.path.file_name().expect("outside directory name");
        let lexical_escape = root.path.join("..").join(outside_name).join("secret.txt");

        assert!(canonical_child_probe(&root.path, &lexical_escape).is_err());
    }

    #[test]
    fn g5_unicode_child_roundtrips_inside_root() {
        let root = TempDir::new("unicode-root");
        let child = root.path.join("Ünicode 日本 😀 mit leerzeichen.txt");
        fs::write(&child, b"ok").expect("write unicode file");

        assert_eq!(
            canonical_child_probe(&root.path, &child).expect("unicode child allowed"),
            child.canonicalize().expect("canonical unicode child"),
        );
    }

    #[test]
    fn g5_deleted_child_fails_closed() {
        let root = TempDir::new("deleted-root");
        let child = root.path.join("deleted.txt");
        fs::write(&child, b"gone").expect("write child");
        fs::remove_file(&child).expect("delete child");

        assert!(canonical_child_probe(&root.path, &child).is_err());
    }

    #[test]
    fn g5_moved_child_fails_closed_at_old_and_foreign_location() {
        let root = TempDir::new("moved-root");
        let outside = TempDir::new("moved-outside");
        let original = root.path.join("moving.txt");
        let moved = outside.path.join("moving.txt");
        fs::write(&original, b"move").expect("write moving child");
        fs::rename(&original, &moved).expect("move child outside root");

        assert!(canonical_child_probe(&root.path, &original).is_err());
        assert!(canonical_child_probe(&root.path, &moved).is_err());
    }

    #[test]
    fn g5_foreign_root_is_rejected_even_for_existing_file() {
        let allowed = TempDir::new("allowed-root");
        let foreign = TempDir::new("foreign-root");
        let foreign_file = foreign.path.join("foreign.txt");
        fs::write(&foreign_file, b"foreign").expect("write foreign file");

        let roots = AllowedRoots::default();
        register_root(&roots, &allowed.path);

        assert!(validated_allowed_file_probe(
            &roots,
            &as_text(&foreign.path),
            &as_text(&foreign_file),
        )
        .is_err());
    }

    #[test]
    fn g5_unavailable_registered_root_fails_closed() {
        let root = TempDir::new("unavailable-root");
        let child = root.path.join("inside.txt");
        fs::write(&child, b"inside").expect("write child");

        let roots = AllowedRoots::default();
        register_root(&roots, &root.path);
        fs::remove_dir_all(&root.path).expect("remove registered root");

        assert!(
            validated_allowed_file_probe(&roots, &as_text(&root.path), &as_text(&child),).is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn g5_symlink_escape_is_rejected() {
        use std::os::unix::fs::symlink;

        let root = TempDir::new("symlink-root");
        let outside = TempDir::new("symlink-outside");
        let secret = outside.path.join("secret.txt");
        fs::write(&secret, b"secret").expect("write outside file");
        let link = root.path.join("escape.txt");
        symlink(&secret, &link).expect("create escape symlink");

        assert!(canonical_child_probe(&root.path, &link).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn g5_alias_root_resolves_to_registered_canonical_root() {
        use std::os::unix::fs::symlink;

        let root = TempDir::new("alias-target");
        let alias_parent = TempDir::new("alias-parent");
        let alias = alias_parent.path.join("root-alias");
        symlink(&root.path, &alias).expect("create root alias");
        let child = root.path.join("inside.txt");
        fs::write(&child, b"inside").expect("write child");

        let roots = AllowedRoots::default();
        register_root(&roots, &root.path);
        let aliased_child = alias.join("inside.txt");

        assert_eq!(
            validated_allowed_file_probe(&roots, &as_text(&alias), &as_text(&aliased_child))
                .expect("canonical alias should remain allowed"),
            child.canonicalize().expect("canonical child"),
        );
    }

    #[test]
    fn g5_export_rejects_line_count_limit_plus_one() {
        let (max_lines, _, _) = export_limits();
        let lines = vec![String::new(); max_lines + 1];
        assert!(validate_export_probe(&lines).is_err());
    }

    #[test]
    fn g5_export_rejects_single_oversized_line() {
        let (_, max_line_bytes, _) = export_limits();
        let lines = vec!["x".repeat(max_line_bytes + 1)];
        assert!(validate_export_probe(&lines).is_err());
    }

    #[test]
    fn g5_export_rejects_total_payload_limit_plus_one() {
        let (_, max_line_bytes, max_total_bytes) = export_limits();
        let line_len = max_line_bytes.saturating_sub(1).max(1);
        let line = "x".repeat(line_len);
        let count = (max_total_bytes / (line_len + 1)) + 1;
        let lines = vec![line; count];
        assert!(validate_export_probe(&lines).is_err());
    }
}
