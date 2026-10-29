import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { addFindingsBatch, createFindingsStats, insightGroups } from "../src/findings-insights.ts";

const MIB = 1024 * 1024;
const file = (kind, sizeBytes, modifiedAt) => ({ kind, sizeBytes, modifiedAt });
const counts = (groups) => Object.fromEntries(groups.map((group) => [group.label, group.count]));

test("type overview uses the same four kinds as colored result rows", () => {
  const stats = createFindingsStats();
  addFindingsBatch(stats, [
    file("image", 0, Date.UTC(2025, 0, 1)),
    file("document", 21, Date.UTC(2025, 0, 1)),
    file("audio", 32, null),
  ]);
  addFindingsBatch(stats, [file("image", 9, null), file("unexpected", 7, null)]);
  assert.equal(stats.total, 5);
  assert.equal(stats.totalBytes, 69);
  assert.deepEqual(counts(insightGroups(stats, "type")), {
    Bilder: 2, Dokumente: 1, Audio: 1, Sonstige: 1,
  });
  assert.equal(new Set(insightGroups(stats, "type").map((group) => group.color)).size, 4);
});

test("year overview groups old and missing dates without losing any finds", () => {
  const stats = createFindingsStats();
  addFindingsBatch(stats, Array.from({ length: 9 }, (_, index) => file("image", 1, Date.UTC(2017 + index, 6, 1))));
  addFindingsBatch(stats, [file("image", 1, null), file("image", 1, Number.NaN)]);
  const groups = insightGroups(stats, "year");
  assert.deepEqual(groups.map((group) => group.label), ["2025", "2024", "2023", "2022", "2021", "Ältere", "Ohne Datum"]);
  assert.equal(groups.find((group) => group.label === "Ältere")?.count, 4);
  assert.equal(groups.find((group) => group.label === "Ohne Datum")?.count, 2);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), stats.total);
});

test("size overview respects every inclusive boundary and invalid data", () => {
  const stats = createFindingsStats();
  const sizes = [0, 1, MIB - 1, MIB, 10 * MIB, 100 * MIB, 1024 * MIB, -1, Number.POSITIVE_INFINITY];
  addFindingsBatch(stats, sizes.map((size) => file("document", size, null)));
  assert.deepEqual(counts(insightGroups(stats, "size")), {
    "0 Byte": 1,
    "Unter 1 MB": 2,
    "1–10 MB": 1,
    "10–100 MB": 1,
    "100 MB–1 GB": 1,
    "Ab 1 GB": 1,
    Unbekannt: 2,
  });
  assert.ok(Number.isFinite(stats.totalBytes));
  assert.equal(insightGroups(stats, "size").reduce((sum, group) => sum + group.count, 0), stats.total);
});

test("a new search gets a fresh independent overview", () => {
  const former = createFindingsStats();
  addFindingsBatch(former, [file("audio", 10, null)]);
  const next = createFindingsStats();
  assert.deepEqual(insightGroups(next, "type"), []);
  addFindingsBatch(next, [file("text", 1, null)]);
  assert.deepEqual(counts(insightGroups(next, "type")), { Sonstige: 1 });
  assert.deepEqual(counts(insightGroups(former, "type")), { Audio: 1 });
});

test("year overview follows the local calendar year shown in file details", () => {
  const moduleUrl = new URL("../src/findings-insights.ts", import.meta.url).href;
  const script = `
    import { addFindingsBatch, createFindingsStats, insightGroups } from ${JSON.stringify(moduleUrl)};
    const stats = createFindingsStats();
    addFindingsBatch(stats, [{ kind: "image", sizeBytes: 1, modifiedAt: Date.UTC(2026, 0, 1, 0, 30) }]);
    process.stdout.write(JSON.stringify(insightGroups(stats, "year").map((group) => group.label)));
  `;
  for (const [timeZone, expectedYear] of [["America/Los_Angeles", "2025"], ["Europe/Berlin", "2026"]]) {
    const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, TZ: timeZone },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), [expectedYear], timeZone);
  }
});
