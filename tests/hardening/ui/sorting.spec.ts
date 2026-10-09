import { expect, test } from "@playwright/test";
import { mergeSortedResults, sortResults, type FileEntry } from "../../../src/search-results";

function entry(name: string, sizeBytes: number, modifiedAt: number): FileEntry {
  return {
    id: name,
    displayName: name,
    path: `/beispiele/${name}`,
    pathKey: name,
    extension: "pdf",
    sizeBytes,
    modifiedAt,
    kind: "document",
  };
}

test("natürliche Namenssortierung liefert eine neue Liste ohne die Eingabe zu ändern", () => {
  const input = [
    entry("datei-10.pdf", 10, 10),
    entry("datei-2.pdf", 20, 20),
    entry("datei-1.pdf", 30, 30),
  ];
  const sorted = sortResults(input, "name-asc");
  expect(sorted.map((item) => item.displayName)).toEqual(["datei-1.pdf", "datei-2.pdf", "datei-10.pdf"]);
  expect(input[0]?.displayName).toBe("datei-10.pdf");
});

test("inkrementelle Treffer bleiben bei jeder Sortierart korrekt eingeordnet", () => {
  const left = [entry("beta.pdf", 4, 40), entry("zeta.pdf", 2, 20)];
  const right = [entry("alpha.pdf", 3, 30), entry("gamma.pdf", 5, 50)];
  const cases = [
    ["name-asc", ["alpha.pdf", "beta.pdf", "gamma.pdf", "zeta.pdf"]],
    ["name-desc", ["zeta.pdf", "gamma.pdf", "beta.pdf", "alpha.pdf"]],
    ["size-desc", ["gamma.pdf", "beta.pdf", "alpha.pdf", "zeta.pdf"]],
    ["modified-desc", ["gamma.pdf", "beta.pdf", "alpha.pdf", "zeta.pdf"]],
  ] as const;
  for (const [mode, expected] of cases) {
    const existing = sortResults(left, mode);
    const merged = mergeSortedResults(existing, right, mode);
    expect(merged.map((item) => item.displayName)).toEqual(expected);
    expect(existing.length).toBe(2);
    expect(right.length).toBe(2);
  }
});
