// Kleine, inkrementelle Auswertung der tatsächlich übermittelten Suchtreffer.
// Die grafische Anzeige benötigt weder eine weitere Dateisuche noch eine Bibliothek.
export type InsightMode = "type" | "year" | "size";

export interface InsightFile {
  kind: string;
  sizeBytes: number;
  modifiedAt: number | null;
}

export interface InsightGroup {
  label: string;
  count: number;
  color: string;
}

export interface FindingsStats {
  total: number;
  totalBytes: number;
  kinds: Map<string, number>;
  years: Map<string, number>;
  sizes: Map<string, number>;
}

const KIND_GROUPS = [
  { key: "image", label: "Bilder", color: "#2da9d6" },
  { key: "document", label: "Dokumente", color: "#f25a71" },
  { key: "audio", label: "Audio", color: "#a36beb" },
  { key: "text", label: "Sonstige", color: "#69ae7e" },
] as const;

const SIZE_GROUPS = [
  { key: "empty", label: "0 Byte", color: "#83a5b4" },
  { key: "small", label: "Unter 1 MB", color: "#2da9d6" },
  { key: "medium", label: "1–10 MB", color: "#69ae7e" },
  { key: "large", label: "10–100 MB", color: "#e9bd59" },
  { key: "huge", label: "100 MB–1 GB", color: "#f08f57" },
  { key: "giant", label: "Ab 1 GB", color: "#a36beb" },
  { key: "unknown", label: "Unbekannt", color: "#9cabb5" },
] as const;

const YEAR_COLORS = ["#2da9d6", "#69ae7e", "#e9bd59", "#a36beb", "#f08f57", "#b17f9b", "#83a5b4"];
const MIB = 1024 * 1024;

export function createFindingsStats(): FindingsStats {
  return { total: 0, totalBytes: 0, kinds: new Map(), years: new Map(), sizes: new Map() };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sizeGroup(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "unknown";
  if (bytes === 0) return "empty";
  if (bytes < MIB) return "small";
  if (bytes < 10 * MIB) return "medium";
  if (bytes < 100 * MIB) return "large";
  if (bytes < 1024 * MIB) return "huge";
  return "giant";
}

function modifiedYear(epochMs: number | null): string {
  if (epochMs === null || !Number.isFinite(epochMs)) return "unknown";
  const year = new Date(epochMs).getFullYear();
  return Number.isFinite(year) ? String(year) : "unknown";
}

export function addFindingsBatch(stats: FindingsStats, items: readonly InsightFile[]): void {
  for (const file of items) {
    stats.total += 1;
    if (Number.isSafeInteger(file.sizeBytes) && file.sizeBytes >= 0) {
      // Bei beschädigten Daten keine ungenauen Summen bilden.
      stats.totalBytes = Math.min(Number.MAX_SAFE_INTEGER, stats.totalBytes + file.sizeBytes);
    }
    increment(stats.kinds, KIND_GROUPS.some((group) => group.key === file.kind) ? file.kind : "text");
    increment(stats.years, modifiedYear(file.modifiedAt));
    increment(stats.sizes, sizeGroup(file.sizeBytes));
  }
}

export function insightGroups(stats: FindingsStats, mode: InsightMode): InsightGroup[] {
  if (mode === "type") {
    return KIND_GROUPS.filter((group) => stats.kinds.has(group.key)).map((group) => ({
      label: group.label, count: stats.kinds.get(group.key)!, color: group.color,
    }));
  }
  if (mode === "size") {
    return SIZE_GROUPS.filter((group) => stats.sizes.has(group.key)).map((group) => ({
      label: group.label, count: stats.sizes.get(group.key)!, color: group.color,
    }));
  }

  // Höchstens fünf einzelne Jahre; ältere Treffer und unbekannte Daten bleiben sichtbar.
  const years = [...stats.years.keys()].filter((key) => key !== "unknown")
    .sort((a, b) => Number(b) - Number(a));
  const groups: InsightGroup[] = years.slice(0, 5).map((year, index) => ({
    label: year, count: stats.years.get(year)!, color: YEAR_COLORS[index]!,
  }));
  const olderCount = years.slice(5).reduce((sum, year) => sum + stats.years.get(year)!, 0);
  if (olderCount > 0) groups.push({ label: "Ältere", count: olderCount, color: YEAR_COLORS[5]! });
  const unknownCount = stats.years.get("unknown") ?? 0;
  if (unknownCount > 0) groups.push({ label: "Ohne Datum", count: unknownCount, color: YEAR_COLORS[6]! });
  return groups;
}
