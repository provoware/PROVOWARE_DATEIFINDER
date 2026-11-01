import test from "node:test";
import assert from "node:assert/strict";
import { toggleAllResults } from "../src/result-selection.ts";

test("selects every result, including items outside the visible window", () => {
  const ids = Array.from({ length: 20_000 }, (_, index) => `file-${index}`);
  const selected = toggleAllResults(ids, new Set());
  assert.equal(selected.size, 20_000);
  assert.ok(selected.has("file-19999"));
  assert.equal(toggleAllResults(ids, selected).size, 0);
});

test("partial selection becomes all, empty results stay unselected", () => {
  assert.deepEqual([...toggleAllResults(["a", "b", "c"], new Set(["a"]))], ["a", "b", "c"]);
  assert.equal(toggleAllResults([], new Set(["old"])).size, 0);
  assert.deepEqual([...toggleAllResults(["x", "x"], new Set())], ["x"]);
});
