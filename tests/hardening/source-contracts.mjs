import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const [frontend, rust, css, tauriConfig] = await Promise.all([
  readFile("src/main.ts", "utf8"),
  readFile("src-tauri/src/lib.rs", "utf8"),
  readFile("src/styles.css", "utf8"),
  readFile("src-tauri/tauri.conf.json", "utf8"),
]);

test("frontend capability fallback is fail-closed", () => {
  const fallback = frontend.match(/platform:\s*\{([\s\S]*?)\n\s*\},\n\};/u)?.[1] ?? "";
  for (const capability of ["canPickFolder", "canOpenFile", "canRevealFile", "canSearchRecursively", "supportsPickedFiles"]) {
    assert.match(fallback, new RegExp(`${capability}:\\s*false`, "u"));
  }
  assert.match(frontend, /Dateizugriffe bleiben aus Sicherheitsgründen deaktiviert/u);
});

test("stale search events are rejected by session id", () => {
  const guards = frontend.match(/payload\.sessionId !== state\.activeSessionId/g) ?? [];
  assert.ok(guards.length >= 4, `expected >=4 stale-event guards, got ${guards.length}`);
});

test("frontend keeps a bounded result render cap", () => {
  const match = frontend.match(/VISIBLE_RESULT_LIMIT\s*=\s*([\d_]+)/u);
  assert.ok(match, "VISIBLE_RESULT_LIMIT missing");
  const limit = Number(match[1].replaceAll("_", ""));
  assert.ok(limit > 0 && limit <= 2_000, `unsafe visible result limit: ${limit}`);
});

test("Rust search hard limits remain explicit", () => {
  assert.match(rust, /batch_size\.clamp\(10, 500\)/u);
  assert.match(rust, /max_results\.clamp\(1, 250_000\)/u);
  assert.match(rust, /id\.is_empty\(\) \|\| id\.len\(\) > 128/u);
  assert.match(rust, /MAX_QUERY_BYTES:\s*usize\s*=\s*4_096/u);
  assert.match(rust, /MAX_QUERY_TOKENS:\s*usize\s*=\s*64/u);
  assert.match(rust, /MAX_ACTIVE_SEARCHES:\s*usize\s*=\s*4/u);
  assert.match(rust, /validate_query\(&request\.query\)\?/u);
  assert.match(rust, /register_search\(&mut sessions, id\.clone\(\), cancelled\.clone\(\)\)\?/u);
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
  assert.match(rust, /VecDeque::from\(\[root\]\)/u);
});

test("accessibility contracts remain enabled", () => {
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /\.footer-actions button \{[\s\S]*?min-height:\s*44px/u);
});

test("desktop minimum reference window remains 768x512", () => {
  const config = JSON.parse(tauriConfig);
  const main = config.app.windows.find((window) => window.label === "main");
  assert.equal(main.minWidth, 768);
  assert.equal(main.minHeight, 512);
});
