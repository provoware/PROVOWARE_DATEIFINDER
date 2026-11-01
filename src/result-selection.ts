/** Ein Klick schaltet alle aktuellen Treffer um, einschließlich nicht gerenderter Zeilen. */
export function toggleAllResults(ids: readonly string[], selected: ReadonlySet<string>): Set<string> {
  const found = new Set(ids);
  if (found.size === 0) return new Set();
  return [...found].every((id) => selected.has(id)) ? new Set() : found;
}
