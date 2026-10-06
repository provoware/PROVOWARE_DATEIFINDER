import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const [frontend, rust, css, tauriConfig, qualityWorkflow, hardeningWorkflow, dependabot] = await Promise.all([
  readFile("src/main.ts", "utf8"),
  readFile("src-tauri/src/lib.rs", "utf8"),
  readFile("src/styles.css", "utf8"),
  readFile("src-tauri/tauri.conf.json", "utf8"),
  readFile(".github/workflows/quality.yml", "utf8"),
  readFile(".github/workflows/autonomous-hardening.yml", "utf8"),
  readFile(".github/dependabot.yml", "utf8"),
]);

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
  const matchIndex = rust.indexOf("if !matches_name(&name, tokens)");
  assert.ok(progressIndex > 0 && matchIndex > 0 && progressIndex < matchIndex);
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
  assert.match(qualityWorkflow, /actions\/cache@0057852bfaa89a56745cba8c7296529d2fc39830/u);
  assert.match(hardeningWorkflow, /actions\/cache@0057852bfaa89a56745cba8c7296529d2fc39830/u);
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

test("desktop minimum reference window remains 768x512", () => {
  const config = JSON.parse(tauriConfig);
  const main = config.app.windows.find((window) => window.label === "main");
  assert.equal(main.minWidth, 768);
  assert.equal(main.minHeight, 512);
});
