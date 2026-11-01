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

test("TXT export exposes zero-width and other invisible filename characters", () => {
  for (const control of ["\u00ad", "\u034f", "\u180e", "\u200b", "\u2060", "\u2061", "\u2062", "\u2063", "\u2064", "\u2065", "\ufeff"]) {
    const code = control.codePointAt(0).toString(16).padStart(4, "0");
    const line = formatExportLine({ displayName: "Rechnung" + control + "2026", path: "/tmp/" + control + "Beleg", sizeBytes: 7 });
    assert.equal(line, "Rechnung\\u" + code + "2026\t/tmp/\\u" + code + "Beleg\t7");
    assert.equal(line.split("\t").length, 3);
  }
});
