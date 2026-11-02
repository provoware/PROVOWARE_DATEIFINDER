import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

for (const name of ["playwright.config.ts", "playwright.hardening.config.ts"]) {
  test(`${name} rejects focused tests`, () => {
    const source = readFileSync(resolve(root, name), "utf8");
    assert.match(source, /export\s+default\s+defineConfig\s*\(\s*\{/);
    const flags = [...source.matchAll(/^  forbidOnly:\s*(true|false)\s*,\s*$/gm)];
    assert.equal(flags.length, 1, "forbidOnly must appear once at config root");
    assert.equal(flags[0][1], "true", "forbidOnly must be true");
  });
}

function requireTimeout(source, key, indentation) {
  const matches = [...source.matchAll(new RegExp(`^${" ".repeat(indentation)}${key}:\\s*([0-9_]+),\\s*$`, "gm"))];
  assert.equal(matches.length, 1, `${key} must appear exactly once`);
  return Number(matches[0][1].replaceAll("_", ""));
}

function validateBrowserLimits(source) {
  assert.equal(requireTimeout(source, "timeout", 2), 30_000);
  assert.equal(requireTimeout(source, "actionTimeout", 4), 15_000);
  assert.equal(requireTimeout(source, "navigationTimeout", 4), 30_000);
}

for (const name of ["playwright.config.ts", "playwright.hardening.config.ts"]) {
  test(`${name} bounds browser actions and navigation`, () => {
    validateBrowserLimits(readFileSync(resolve(root, name), "utf8"));
  });
}

test("browser timeout contract rejects missing, duplicate or excessive limits", () => {
  const source = readFileSync(resolve(root, "playwright.config.ts"), "utf8");
  assert.throws(() => validateBrowserLimits(source.replace("    actionTimeout: 15_000,\n", "")));
  assert.throws(() => validateBrowserLimits(source.replace("    actionTimeout: 15_000,", "    actionTimeout: 0,")));
  assert.throws(() => validateBrowserLimits(source.replace("    actionTimeout: 15_000,", "    actionTimeout: 120_000,")));
  assert.throws(() => validateBrowserLimits(source.replace("    navigationTimeout: 30_000,", "    navigationTimeout: 120_000,")));
  assert.throws(() => validateBrowserLimits(source.replace("    actionTimeout: 15_000,", "    actionTimeout: 15_000,\n    actionTimeout: 15_000,")));
});
