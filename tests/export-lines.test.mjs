import assert from "node:assert/strict";
import test from "node:test";
import { formatExportLine } from "../src/export-lines.ts";

test("TXT export makes bidi formatting controls visible without changing field boundaries", () => {
  const controls = ["\u061c", "\u200e", "\u200f", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069", "\u206a", "\u206f"];
  for (const control of controls) {
    const code = control.charCodeAt(0).toString(16).padStart(4, "0");
    const line = formatExportLine({ displayName: "invoice" + control + "2026", path: "/tmp/" + control + "invoice", sizeBytes: 5 });
    assert.equal(line, "invoice\\u" + code + "2026\t/tmp/\\u" + code + "invoice\t5");
    assert.equal(line.split("\t").length, 3);
    assert.equal(line.includes(control), false);
  }
});

test("TXT export retains ordinary Unicode and escapes line breaks, tabs and backslashes", () => {
  assert.equal(
    formatExportLine({ displayName: "صور 🧑‍💻\\notes\nfile", path: "/tmp/Ärger\t2026", sizeBytes: 42 }),
    "صور 🧑‍💻\\\\notes\\nfile\t/tmp/Ärger\\t2026\t42",
  );
});
