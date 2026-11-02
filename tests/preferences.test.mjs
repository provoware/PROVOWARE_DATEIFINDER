import test from "node:test";
import assert from "node:assert/strict";
import { parsePresets, normalizeZoom, MAX_PRESETS, isSearchQueryWithinTokenLimit, isValidPresetContent, presetNameKey } from "../src/preferences.ts";
import { isSearchQueryWithinByteLimit } from "../src/search-query.ts";

test("templates accept only meaningful bounded search settings", () => {
  assert.deepEqual(parsePresets(null), []);
  const presets = parsePresets([
    { name: "Rechnungen", query: "  rechnung 2026 ", matchMode: "all", fileTypes: ["document", "document"] },
    { name: "rechnungen", query: "duplicate", matchMode: "any", fileTypes: [] },
    { name: "Bilder", query: "urlaub", matchMode: "any", fileTypes: ["image"] },
    { name: "Unsafe", query: "\u0000", matchMode: "all", fileTypes: ["../outside"] },
    { name: "No query", query: " ", matchMode: "all", fileTypes: [] },
    { name: "Invalid mode", query: "yes", matchMode: "foo", fileTypes: [] },
  ]);
  assert.deepEqual(presets, [
    { name: "Rechnungen", query: "rechnung 2026", matchMode: "all", fileTypes: ["document"] },
    { name: "Bilder", query: "urlaub", matchMode: "any", fileTypes: ["image"] },
  ]);
});

test("template import limit and zoom input never produce unbounded settings", () => {
  const many = Array.from({ length: 100 }, (_, index) => ({
    name: `Suche ${index}`, query: `Suche ${index}`, matchMode: "all", fileTypes: [],
  }));
  assert.equal(parsePresets(many).length, MAX_PRESETS);
  assert.equal(normalizeZoom(0.1), 0.8);
  assert.equal(normalizeZoom(11), 1.5);
  assert.equal(normalizeZoom(1.34), 1.3);
  assert.equal(normalizeZoom(Number.NaN), 1);
  assert.equal(normalizeZoom("1.5"), 1);
});

test("import rejects invisible control characters in preset names and queries", () => {
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  assert.deepEqual(parsePresets([
    preset("Good", "invoice"),
    preset("Bad\nName", "invoice"),
    preset("Hidden\u0000Name", "invoice"),
    preset("Bad query", "invoice\u0000secret"),
    preset("Tab query", "one\ttwo"),
  ]), [preset("Good", "invoice")]);
});

test("import rejects C1 controls in preset names and queries", () => {
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  assert.deepEqual(parsePresets([
    preset("C1\u0085Name", "invoice"),
    preset("C1\u009fName", "invoice"),
    preset("Bad query", "invoice\u009bsecret"),
    preset("Good", "invoice"),
  ]), [preset("Good", "invoice")]);
});

test("imported presets reject UTF-8 queries that exceed the Rust search limit", () => {
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  const accepted = [
    preset("ASCII", "a".repeat(4096)),
    preset("Umlauts", "ä".repeat(2048)),
    preset("Emoji", "🦊".repeat(1024)),
  ];
  const rejected = [
    preset("Too many umlauts", "ä".repeat(2049)),
    preset("Too many emoji", "🦊".repeat(1025)),
  ];
  for (const item of accepted) assert.equal(isSearchQueryWithinByteLimit(item.query), true);
  for (const item of rejected) assert.equal(isSearchQueryWithinByteLimit(item.query), false);
  assert.deepEqual(parsePresets([...accepted, ...rejected]).map((item) => item.name), accepted.map((item) => item.name));
});

test("saved searches reject more than Rust's 64 Unicode whitespace-separated words", () => {
  const preset = (query) => ({ name: "Grenze", query, matchMode: "all", fileTypes: [] });
  const words = (count, separator = " ") => Array(count).fill("wort").join(separator);
  assert.equal(isSearchQueryWithinTokenLimit(words(64)), true);
  assert.equal(isSearchQueryWithinTokenLimit(words(65)), false);
  assert.equal(isSearchQueryWithinTokenLimit(words(65, "\u2003")), false);
  assert.equal(isSearchQueryWithinTokenLimit(words(64, "\u00a0")), true);
  assert.equal(parsePresets([preset(words(64))]).length, 1);
  assert.equal(parsePresets([preset(words(65))]).length, 0);
  assert.equal(parsePresets([preset(words(65, "\u2003"))]).length, 0);
});


test("saving and reloading presets enforce the same control-character rules", () => {
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  for (const [name, query] of [
    ["Rechnungen\u0085Alt", "rechnung"],
    ["Rechnungen", "rechnung\u009balt"],
    ["Rechnungen\nAlt", "rechnung"],
    ["Rechnungen", "rechnung\u0000alt"],
    ["x".repeat(49), "rechnung"],
  ]) {
    assert.equal(isValidPresetContent(name, query), false, JSON.stringify({ name, query }));
    assert.deepEqual(parsePresets([preset(name, query)]), []);
  }
  assert.equal(isValidPresetContent("Rechnungen 2026", "rechnung 2026"), true);
  assert.equal(parsePresets([preset("Rechnungen 2026", "rechnung 2026")]).length, 1);
});

test("preset import and saving reject invisible Unicode layout and bidi controls", () => {
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  const invisible = ["\u061c", "\u200e", "\u200f", "\u2028", "\u2029", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069", "\u206a", "\u206f"];
  for (const character of invisible) {
    for (const [name, query] of [
      [`Rechnung${character}2026`, "rechnung"],
      ["Rechnung", `rechnung${character}2026`],
    ]) {
      assert.equal(isValidPresetContent(name, query), false, `U+${character.codePointAt(0)?.toString(16)}`);
      assert.deepEqual(parsePresets([preset(name, query)]), []);
    }
  }
});

test("ordinary Unicode and emoji joiners remain valid in presets", () => {
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  for (const [name, query] of [["Büro", "🧑‍💻"], ["صور", "ملف"], ["Rechnungen", "rechnung 2026"]]) {
    assert.equal(isValidPresetContent(name, query), true);
    assert.deepEqual(parsePresets([preset(name, query)]), [preset(name, query)]);
  }
});


test("canonically equivalent preset names cannot bypass duplicate checks", () => {
  const composed = "Caf\u00e9";
  const decomposed = "Cafe\u0301";
  assert.notEqual(composed, decomposed);
  assert.equal(presetNameKey(composed), presetNameKey(decomposed));
  assert.equal(presetNameKey("B\u00dcRO"), presetNameKey("b\u00fcro"));
  const preset = (name, query) => ({ name, query, matchMode: "all", fileTypes: [] });
  assert.deepEqual(parsePresets([
    preset(composed, "first"),
    preset(decomposed, "duplicate"),
    preset("B\u00dcRO", "third"),
    preset("b\u00fcro", "duplicate"),
  ]), [preset(composed, "first"), preset("B\u00dcRO", "third")]);
  assert.notEqual(presetNameKey("Cafe"), presetNameKey(composed));
});
