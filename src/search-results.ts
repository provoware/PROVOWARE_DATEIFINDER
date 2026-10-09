/** Sortierung und Zusammenführung der Treffer – unabhängig von der Benutzeroberfläche. */

export type SortMode = "name-asc" | "name-desc" | "size-desc" | "modified-desc";

export interface FileEntry {
  id: string;
  displayName: string;
  path: string;
  pathKey: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: number | null;
  kind: string;
}

function compareResults(mode: SortMode): (a: FileEntry, b: FileEntry) => number {
  const byName = (a: FileEntry, b: FileEntry) =>
    a.displayName.localeCompare(b.displayName, "de", { numeric: true, sensitivity: "base" });

  switch (mode) {
    case "name-asc":
      return byName;
    case "name-desc":
      return (a, b) => byName(b, a);
    case "size-desc":
      return (a, b) => b.sizeBytes - a.sizeBytes || byName(a, b);
    case "modified-desc":
      return (a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) || byName(a, b);
  }
}

export function sortResults(items: FileEntry[], mode: SortMode): FileEntry[] {
  return [...items].sort(compareResults(mode));
}

export function mergeSortedResults(existing: FileEntry[], incoming: FileEntry[], mode: SortMode): FileEntry[] {
  if (existing.length === 0) return sortResults(incoming, mode);
  if (incoming.length === 0) return existing;

  const compare = compareResults(mode);
  const right = sortResults(incoming, mode);
  const merged = new Array<FileEntry>(existing.length + right.length);
  let leftIndex = 0;
  let rightIndex = 0;
  let targetIndex = 0;

  while (leftIndex < existing.length && rightIndex < right.length) {
    const leftItem = existing[leftIndex]!;
    const rightItem = right[rightIndex]!;
    if (compare(leftItem, rightItem) <= 0) {
      merged[targetIndex++] = leftItem;
      leftIndex += 1;
    } else {
      merged[targetIndex++] = rightItem;
      rightIndex += 1;
    }
  }
  while (leftIndex < existing.length) {
    merged[targetIndex++] = existing[leftIndex]!;
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    merged[targetIndex++] = right[rightIndex]!;
    rightIndex += 1;
  }

  return merged;
}
