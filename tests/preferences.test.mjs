import test from "node:test";
import assert from "node:assert/strict";
import { parsePresets, normalizeZoom, MAX_PRESETS } from "../src/preferences.ts";

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
