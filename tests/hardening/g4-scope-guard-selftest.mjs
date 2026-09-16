import assert from "node:assert/strict";

const baselineAllowed = [
  /^\.github\/workflows\//u,
  /^tests\/hardening\//u,
  /^playwright(?:\.[^/]+)?\.config\.ts$/u,
  /^docs\//u,
];
const g4Only = /^src-tauri\/src\/lib\.rs$/u;

function isAllowed(path, g4Enabled = false) {
  return baselineAllowed.some((pattern) => pattern.test(path)) || (g4Enabled && g4Only.test(path));
}

assert.equal(isAllowed("src-tauri/src/lib.rs", false), false, "standard G0 must block lib.rs");
assert.equal(isAllowed("src-tauri/src/lib.rs", true), true, "G4 scope must allow exactly lib.rs");

for (const path of [
  "src-tauri/src/main.rs",
  "src/main.ts",
  "src/app.ts",
  "src-tauri/Cargo.toml",
  "package.json",
]) {
  assert.equal(isAllowed(path, true), false, `G4 scope must still block ${path}`);
}

for (const path of [
  ".github/workflows/hardening.yml",
  "tests/hardening/example.mjs",
  "playwright.config.ts",
  "docs/G4_TESTABILITY_DESIGN.md",
]) {
  assert.equal(isAllowed(path, false), true, `baseline G0 must continue allowing ${path}`);
}

console.log("G4 SCOPE SELFTEST PASS: default blocks lib.rs; opt-in allows only lib.rs; other product paths remain blocked.");
