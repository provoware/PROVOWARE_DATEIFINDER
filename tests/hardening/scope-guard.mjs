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
console.log(`G0 changed files: ${changed.length}`);
for (const path of changed) console.log(` - ${path}`);

assert.deepEqual(
  forbidden,
  [],
  `G0 scope violation; product or unapproved files changed:\n${forbidden.join("\n")}`,
);

console.log("G0 PASS: only approved CI/test/documentation paths changed.");
