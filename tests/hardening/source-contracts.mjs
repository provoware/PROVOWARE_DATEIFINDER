import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { validActionName } from "../../src/file-action-names.ts";

const [frontend, rust, fileActions, css, tauriConfig, qualityWorkflow, hardeningWorkflow, dependabot] = await Promise.all([
  readFile("src/main.ts", "utf8"),
  readFile("src-tauri/src/lib.rs", "utf8"),
  readFile("src-tauri/src/file_actions.rs", "utf8"),
  readFile("src/styles.css", "utf8"),
  readFile("src-tauri/tauri.conf.json", "utf8"),
  readFile(".github/workflows/quality.yml", "utf8"),
  readFile(".github/workflows/autonomous-hardening.yml", "utf8"),
  readFile(".github/dependabot.yml", "utf8"),
]);

test("copy, move and ZIP operate only on selected permission-checked path keys", () => {
  assert.match(frontend, /pathKeys:\s*files\.map\(\(file\) => file\.pathKey\)/u);
  assert.match(rust, /async fn execute_file_action\(/u);
  assert.match(rust, /validated_allowed_file\(&allowed_roots, &request\.root_path_key, key\)/u);
  assert.match(fileActions, /MAX_ACTION_FILES:\s*usize\s*=\s*100/u);
  assert.match(fileActions, /MAX_ACTION_BYTES:\s*u64\s*=\s*8 \* 1024 \* 1024 \* 1024/u);
  assert.match(fileActions, /path\.starts_with\(&canonical_root\)/u);
});

test("file writes use exclusive temporary files, post-checks and cancellation", () => {
  assert.match(fileActions, /\.create_new\(true\)/u);
  assert.match(fileActions, /struct CleanupPath/u);
  assert.match(fileActions, /impl Drop for CleanupPath/u);
  assert.match(fileActions, /compare_contents\(source, staged, cancel\)/u);
  assert.match(fileActions, /compare_contents\(source, destination, cancel\)/u);
  assert.match(fileActions, /same_file_identity\(source_metadata, &current\)/u);
  assert.match(fileActions, /fn commit_without_overwrite\(/u);
  assert.match(fileActions, /fs::hard_link\(staged, destination\)/u);
  assert.match(fileActions, /fs::remove_file\(source\)/u);
  assert.match(fileActions, /wait_for_zip\(child, cancel\)/u);
  assert.match(fileActions, /\.arg\("-T"\)/u);
  assert.match(rust, /fn cancel_file_action\(/u);
});

test("version 0.2 measures real bytes and verifies recovery paths in isolated tests", () => {
  assert.match(fileActions, /struct ByteProgress/u);
  assert.match(fileActions, /copy_to_stage\(source, staged, cancel, \|bytes\| meter\.advanced\(bytes, phase\)\)/u);
  assert.match(fileActions, /fn interrupt_mid_write_removes_incomplete_temp_and_preserves_original\(/u);
  assert.match(fileActions, /fn source_change_during_copy_prevents_move_and_cleans_staging\(/u);
  assert.match(fileActions, /fn collision_appearing_after_preflight_never_overwrites_other_data\(/u);
  assert.match(fileActions, /fn old_temporary_file_is_preserved_and_manual_retry_is_safe\(/u);
  assert.match(rust, /bytes_per_second:\s*u64/u);
  assert.match(frontend, /fileActionByteDetail\.textContent = detail/u);
});

test("frontend capability fallback is fail-closed", () => {
  const fallback = frontend.match(/platform:\s*\{([\s\S]*?)\n\s*\},\n\};/u)?.[1] ?? "";
  for (const capability of ["canPickFolder", "canOpenFile", "canRevealFile", "canSearchRecursively", "supportsPickedFiles"]) {
    assert.match(fallback, new RegExp(`${capability}:\\s*false`, "u"));
  }
  assert.match(frontend, /Dateizugriffe bleiben aus Sicherheitsgründen deaktiviert/u);
});

test("picked-file capability stays disabled until picked files are searchable", () => {
  assert.match(rust, /supports_picked_files:\s*false/u);
  assert.doesNotMatch(frontend, /pickFiles\s*\(/u);
});

test("stale search events are rejected by session id", () => {
  const guards = frontend.match(/payload\.sessionId !== state\.activeSessionId/g) ?? [];
  assert.ok(guards.length >= 4, `expected >=4 stale-event guards, got ${guards.length}`);
});

test("frontend virtualizes large result sets instead of rendering a fixed 2000-row cap", () => {
  assert.match(frontend, /VIRTUAL_OVERSCAN_ROWS\s*=\s*8/u);
  assert.match(frontend, /function visibleResultRange\(/u);
  assert.match(frontend, /results-virtual-canvas/u);
  assert.match(frontend, /mergeSortedResults\(state\.results, payload\.items, state\.sort\)/u);
  assert.doesNotMatch(frontend, /VISIBLE_RESULT_LIMIT/u);
});

test("Rust search hard limits remain explicit", () => {
  assert.match(rust, /batch_size\.clamp\(10, 500\)/u);
  assert.match(rust, /max_results\.clamp\(1, 250_000\)/u);
  assert.match(rust, /id\.is_empty\(\) \|\| id\.len\(\) > 128/u);
  assert.match(rust, /MAX_QUERY_BYTES:\s*usize\s*=\s*4_096/u);
  assert.match(rust, /MAX_QUERY_TOKENS:\s*usize\s*=\s*64/u);
  assert.match(rust, /MAX_ACTIVE_SEARCHES:\s*usize\s*=\s*4/u);
  assert.match(rust, /validate_query\(&request\.query\)\?/u);
  assert.match(rust, /register_search_session\(&mut sessions, id\.clone\(\), cancelled\.clone\(\)\)\?/u);
  assert.match(frontend, /SEARCH_RESULT_LIMIT\s*=\s*20_000/u);
  assert.match(frontend, /maxResults:\s*SEARCH_RESULT_LIMIT/u);
});

test("result truncation is explicit from Rust through the UI", () => {
  assert.match(rust, /pub limit_reached:\s*bool/u);
  assert.match(rust, /limit_reached = true/u);
  assert.match(rust, /limit_reached:\s*outcome\.limit_reached/u);
  assert.match(frontend, /limitReached:\s*boolean/u);
  assert.match(frontend, /Treffergrenze erreicht/u);
  assert.match(frontend, /Anzeige und Export sind unvollständig/u);
});

test("file actions use lossless path keys instead of display paths", () => {
  assert.match(frontend, /pathKey:\s*string/u);
  assert.match(frontend, /openFile\(state\.sourcePathKey, file\.pathKey\)/u);
  assert.match(frontend, /revealFile\(state\.sourcePathKey, file\.pathKey\)/u);
  assert.match(rust, /path_key:\s*encode_path\(path\)/u);
  assert.match(rust, /let file = decode_path\(path_key\)\?/u);
});

test("search progress is independent of match branch", () => {
  const progressIndex = rust.indexOf("should_emit_progress(scanned_count, last_progress)");
  const matchIndex = rust.indexOf("let name_matches = matches_name(&name, filters.tokens, filters.match_mode)");
  assert.ok(progressIndex > 0 && matchIndex > 0 && progressIndex < matchIndex);
});

test("optional text search is bounded and text preview honors the source permission", () => {
  assert.match(rust, /const MAX_TEXT_BYTES:\s*u64\s*=\s*256 \* 1024/u);
  assert.match(rust, /if metadata\.len\(\) > MAX_TEXT_BYTES \|\| !is_readable_text\(&entry\.path\(\)\)/u);
  assert.match(rust, /fn bounded_utf8_text\(/u);
  assert.match(rust, /fn preview_text\([\s\S]*?validated_allowed_file\(&allowed_roots, &root_path_key, &path_key\)/u);
  assert.match(rust, /search_contents: bool/u);
});

test("saved folder is inspected without granting access and requires explicit restoration", () => {
  const inspect = rust.slice(rust.indexOf("fn inspect_saved_root("), rust.indexOf("fn restore_saved_root("));
  assert.match(inspect, /read_dir\(candidate\)\.is_ok\(\)/u);
  assert.doesNotMatch(inspect, /roots\.insert/u);
  const restore = rust.slice(rust.indexOf("fn restore_saved_root("), rust.indexOf("fn start_search("));
  assert.match(restore, /if !inspect_saved_root\(path\.clone\(\)\)/u);
  assert.match(restore, /roots\.insert\(canonical\.clone\(\)\)/u);
  assert.match(frontend, /ui\.returnUse\.addEventListener\("click"/u);
});

test("template import and export have size bounds and exports never overwrite existing files", () => {
  const jsonImport = rust.slice(rust.indexOf("async fn import_search_presets("), rust.indexOf("async fn export_search_presets("));
  const jsonExport = rust.slice(rust.indexOf("async fn export_search_presets("), rust.indexOf("pub fn run()"));
  assert.match(jsonImport, /metadata\.len\(\) > 64 \* 1024/u);
  assert.match(jsonImport, /take\(64 \* 1024 \+ 1\)/u);
  assert.match(jsonExport, /create_new\(true\)/u);
});

test("file type and word-mode filtering is bounded before metadata is read", () => {
  assert.match(rust, /validate_file_types\(&request\.file_types\)\?/u);
  assert.match(rust, /types\.len\(\) > 4/u);
  assert.match(rust, /MatchMode::Any => tokens\.iter\(\)\.any/u);
  const typeFilter = rust.indexOf("!filters.file_types.is_empty() && !filters.file_types.contains(classify(&extension))");
  const metadata = rust.indexOf("let metadata = match entry.metadata()");
  assert.ok(typeFilter > 0 && metadata > typeFilter, "file type filter must run before file metadata");
});

test("cancellation flushes pending batch before cancelled event", () => {
  const finalBatch = rust.lastIndexOf("if !batch.is_empty()");
  const cancelledEvent = rust.lastIndexOf('"search-cancelled"');
  assert.ok(finalBatch > 0 && cancelledEvent > finalBatch);
});

test("export is bounded by line and aggregate bytes", () => {
  assert.match(rust, /MAX_EXPORT_LINES:\s*usize\s*=\s*250_000/u);
  assert.match(rust, /MAX_EXPORT_LINE_BYTES:\s*usize\s*=\s*32_768/u);
  assert.match(rust, /MAX_EXPORT_TOTAL_BYTES:\s*usize\s*=\s*64 \* 1024 \* 1024/u);
  assert.match(rust, /validate_export_lines\(&lines\)\?/u);
});

test("path boundary and symlink protections remain present", () => {
  assert.match(rust, /if !child\.starts_with\(&root\)/u);
  assert.match(rust, /if file_type\.is_symlink\(\)/u);
  assert.match(rust, /fn canonical_scan_directory\(/u);
  assert.match(rust, /canonical_scan_directory\(&canonical_root, &directory\)/u);
  assert.match(rust, /VecDeque::from\(\[canonical_root\.clone\(\)\]\)/u);
  assert.match(rust, /queued_directory_is_revalidated_after_symlink_swap/u);
});


test("hardening executes the complete UI suite and dependency caches stay enabled", () => {
  assert.match(hardeningWorkflow, /run:\s*npm run test:ui/u);
  assert.doesNotMatch(hardeningWorkflow, /--grep "reference shell\|theme\|keyboard"/u);
  assert.match(qualityWorkflow, /cache:\s*npm/u);
  assert.match(hardeningWorkflow, /cache:\s*npm/u);
  assert.match(qualityWorkflow, /actions\/cache@caa296126883cff596d87d8935842f9db880ef25/u);
  assert.match(hardeningWorkflow, /actions\/cache@caa296126883cff596d87d8935842f9db880ef25/u);
});

test("weekly dependency monitoring covers npm Cargo and GitHub Actions", () => {
  assert.match(dependabot, /package-ecosystem:\s*npm/u);
  assert.match(dependabot, /package-ecosystem:\s*cargo/u);
  assert.match(dependabot, /package-ecosystem:\s*github-actions/u);
  assert.match(dependabot, /interval:\s*weekly/u);
});

test("accessibility contracts remain enabled", () => {
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /\.footer-actions button \{[\s\S]*?min-height:\s*44px/u);
  assert.match(css, /\.file-path,[\s\S]*?font-size:\s*11px/u);
  assert.match(css, /\.status-block small \{[\s\S]*?font-size:\s*11px/u);
  assert.match(css, /\.nav-item small \{[\s\S]*?font-size:\s*11px/u);
});

test("desktop opens at the reference size but can resize to a smaller safe minimum", () => {
  const config = JSON.parse(tauriConfig);
  const main = config.app.windows.find((window) => window.label === "main");
  assert.equal(main.width, 768);
  assert.equal(main.height, 512);
  assert.equal(main.minWidth, 620);
  assert.equal(main.minHeight, 420);
  assert.equal(main.resizable, true);
});

test("file-action names enforce the Rust limit of 100 UTF-8 bytes", () => {
  assert.equal(validActionName("a".repeat(100)), true);
  assert.equal(validActionName("a".repeat(101)), false);
  assert.equal(validActionName("ä".repeat(50)), true);
  assert.equal(validActionName("ä".repeat(51)), false);
  assert.equal(validActionName("🦊".repeat(25)), true);
  assert.equal(validActionName("🦊".repeat(26)), false);
});

test("file-action names reject Unicode controls without weakening existing rules", () => {
  for (const name of ["abc\u0085def", "abc\u009fdef", "abc\u0000def", "abc\u007fdef",
    "abc/def", ".hidden", "trailing.", " abc", "abc "]) {
    assert.equal(validActionName(name), false, "unexpectedly accepted " + JSON.stringify(name));
  }
  assert.equal(validActionName("Urlaub 2026.zip"), true);
  assert.match(frontend, /import \{ validActionName \} from "\.\/file-action-names"/u);
  assert.match(fileActions, /name\.len\(\) <= 100/u);
  assert.match(fileActions, /character\.is_control\(\)/u);
});

test("file-action names reject invisible bidi and layout controls", () => {
  const controls = [
    "\u061c", "\u200e", "\u200f", "\u2028", "\u2029",
    "\u202a", "\u202b", "\u202c", "\u202d", "\u202e",
    "\u2066", "\u2067", "\u2068", "\u2069", "\u206a",
    "\u206b", "\u206c", "\u206d", "\u206e", "\u206f",
  ];
  for (const character of controls) {
    assert.equal(validActionName(`archiv${character}2026.zip`), false, `U+${character.codePointAt(0)?.toString(16)}`);
  }
  assert.equal(validActionName("Büro 🧑‍💻.zip"), true);
});
