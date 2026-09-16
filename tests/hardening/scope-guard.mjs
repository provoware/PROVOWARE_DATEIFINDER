import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const contractSha = process.env.ITERATION_CONTRACT_SHA;
assert.ok(contractSha, "ITERATION_CONTRACT_SHA is required");

const allowed = [
  /^\.github\/workflows\//u,
  /^tests\/hardening\//u,
  /^playwright(?:\.[^/]+)?\.config\.ts$/u,
  /^docs\//u,
];

// G4 has one deliberately narrow product-path exception so the real scanner can
// become testable without opening any other production path. The exception is
// opt-in from CI and is intentionally exact: only src-tauri/src/lib.rs.
if (process.env.G4_TESTABILITY_SCOPE === "1") {
  allowed.push(/^src-tauri\/src\/lib\.rs$/u);
}

const output = execFileSync(
  "git",
  ["diff", "--name-only", `${contractSha}...HEAD`],
  { encoding: "utf8" },
);

const changed = output
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean);

const forbidden = changed.filter((path) => !allowed.some((pattern) => pattern.test(path)));

console.log(`G0 base: ${contractSha}`);
console.log(`G0 head: ${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()}`);
console.log(`G0 G4 testability scope: ${process.env.G4_TESTABILITY_SCOPE === "1" ? "enabled (src-tauri/src/lib.rs only)" : "disabled"}`);
console.log(`G0 changed files: ${changed.length}`);
for (const path of changed) console.log(` - ${path}`);

assert.deepEqual(
  forbidden,
  [],
  `G0 scope violation; product or unapproved files changed:\n${forbidden.join("\n")}`,
);

console.log("G0 PASS: only approved paths changed for the active scope.");
