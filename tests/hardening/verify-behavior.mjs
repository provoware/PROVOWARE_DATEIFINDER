import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceScript = resolve(projectRoot, "verify.sh");
const nodeTests = readdirSync(resolve(projectRoot, "tests")).filter((name) => name.endsWith(".mjs"));

function fixture(failStage = "") {
  const root = mkdtempSync(join(tmpdir(), "dateifinder-verify-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  mkdirSync(join(root, "tests", "hardening"), { recursive: true });
  copyFileSync(sourceScript, join(root, "verify.sh"));
  for (const name of nodeTests) writeFileSync(join(root, "tests", name), "");
  const calls = join(root, "calls.log");
  const mock = (name, failure) => {
    const path = join(bin, name);
    writeFileSync(path, '#!/usr/bin/env bash\nprintf \'' + name + ' %s\\n\' "$*" >> "$MOCK_CALLS"\n' + failure + '\n', { mode: 0o755 });
    chmodSync(path, 0o755);
  };
  mock("node", '[[ "$MOCK_FAIL_STAGE" == "node-regressions" && "$1" == "--experimental-strip-types" ]] && exit 41\nexit 0');
  mock("npm", '[[ "$MOCK_FAIL_STAGE" == "npm-check" ]] && exit 42\nexit 0');
  mock("cargo", '[[ "$MOCK_FAIL_STAGE" == "cargo-test" && "$1" == "test" ]] && exit 43\nexit 0');
  return {
    run() {
      const result = spawnSync("/bin/bash", [join(root, "verify.sh")], {
        cwd: root,
        env: { ...process.env, PATH: bin + ":/usr/bin:/bin", MOCK_CALLS: calls, MOCK_FAIL_STAGE: failStage },
        encoding: "utf8",
        timeout: 3_000,
      });
      return { ...result, calls: readFileSync(calls, "utf8").trim().split("\n") };
    },
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}

test("local verification runs every Node regression before frontend and Rust checks", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Fertig – Kernprüfungen GRÜN/);
    assert.equal(result.calls.length, 6);
    assert.match(result.calls[0], /^node --test tests\/hardening\/source-contracts\.mjs$/);
    assert.match(result.calls[1], /^node --experimental-strip-types --test tests\//);
    assert.doesNotMatch(result.calls[1], /\*/);
    for (const name of nodeTests) assert.ok(result.calls[1].includes("tests/" + name), "missing " + name);
    assert.equal(result.calls[2], "npm run check");
    assert.match(result.calls[3], /^cargo fmt /);
    assert.match(result.calls[4], /^cargo clippy /);
    assert.match(result.calls[5], /^cargo test /);
  } finally { f.cleanup(); }
});

for (const [stage, expectedCalls] of [["node-regressions", 2], ["npm-check", 3], ["cargo-test", 6]]) {
  test("local verification stops on " + stage + " without a false green result", () => {
    const f = fixture(stage);
    try {
      const result = f.run();
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.equal(result.calls.length, expectedCalls);
      assert.doesNotMatch(result.stdout, /Fertig – Kernprüfungen GRÜN/);
    } finally { f.cleanup(); }
  });
}
