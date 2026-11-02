import assert from "node:assert/strict";
import test from "node:test";
import { isSearchQueryWithinByteLimit } from "../src/search-query.ts";

test("UTF-8 byte boundaries retain ordinary Unicode and valid emoji pairs", () => {
  for (const query of ["a".repeat(4096), "ä".repeat(2048), "🦊".repeat(1024), "Büro 🦊 2026"]) {
    assert.equal(isSearchQueryWithinByteLimit(query), true, JSON.stringify(query.slice(0, 20)));
  }
  for (const query of ["a".repeat(4097), "ä".repeat(2049), "🦊".repeat(1025)]) {
    assert.equal(isSearchQueryWithinByteLimit(query), false);
  }
});

test("unpaired UTF-16 surrogates cannot silently become replacement characters", () => {
  for (const query of ["\uD800", "\uDBFF", "\uDC00", "\uDFFF", "report\uD8002026", "🦊\uDC00", "\uD800🦊"]) {
    assert.equal(isSearchQueryWithinByteLimit(query), false, JSON.stringify(query));
  }
});

test("valid surrogate pairs remain searchable next to non-Latin characters", () => {
  assert.equal(isSearchQueryWithinByteLimit("صور 🧑‍💻 文件"), true);
  assert.equal(isSearchQueryWithinByteLimit("🦊\uD83D\uDCBB"), true);
});
