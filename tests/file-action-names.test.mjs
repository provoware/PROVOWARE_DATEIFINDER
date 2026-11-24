import assert from "node:assert/strict";
import test from "node:test";
import { validActionName } from "../src/file-action-names.ts";

test("invisible formatting characters cannot disguise file action names", () => {
  const invisible = [
    "\u00ad", "\u034f", "\u180e", "\u200b",
    "\u2060", "\u2061", "\u2062", "\u2063", "\u2064", "\u2065", "\ufeff",
  ];
  for (const character of invisible) {
    assert.equal(validActionName("Archiv" + character + "2026.zip"), false,
      "U+" + character.codePointAt(0).toString(16).toUpperCase());
  }
});

test("ordinary international names and joined emoji remain valid", () => {
  for (const name of ["Büro 🧑‍💻.zip", "مرحبا.zip", "Fotos 2026"]) {
    assert.equal(validActionName(name), true, name);
  }
  for (const name of ["../archiv.zip", "A/B.zip", "  ", ".hidden", "bad\nname"]) {
    assert.equal(validActionName(name), false, JSON.stringify(name));
  }
});
