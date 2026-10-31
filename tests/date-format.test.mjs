import assert from "node:assert/strict";
import test from "node:test";
import { formatDate } from "../src/date-format.ts";

test("the Unix epoch is a valid file modification time", () => {
  const expected = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(0));
  assert.equal(formatDate(0), expected);
  assert.notEqual(formatDate(0), "–");
});

test("missing and invalid timestamps cannot crash the file preview", () => {
  for (const timestamp of [null, Number.NaN, Infinity, -Infinity, 9e15, -9e15]) {
    assert.equal(formatDate(timestamp), "–");
  }
});

test("ordinary and pre-epoch dates use the existing German locale format", () => {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium", timeStyle: "short",
  });
  for (const timestamp of [Date.UTC(2026, 9, 26, 9, 0), -1]) {
    assert.equal(formatDate(timestamp), formatter.format(new Date(timestamp)));
  }
});
