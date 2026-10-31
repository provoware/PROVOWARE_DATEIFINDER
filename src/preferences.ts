export type SavedMatchMode = "all" | "any";
export type SavedFileKind = "image" | "document" | "audio" | "text";

export interface SearchPreset {
  name: string;
  query: string;
  matchMode: SavedMatchMode;
  fileTypes: SavedFileKind[];
}

export const MAX_PRESETS = 20;
export const MAX_SEARCH_QUERY_TOKENS = 64;
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 1.5;
const FILE_KINDS: SavedFileKind[] = ["image", "document", "audio", "text"];
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

// Gleiche Prüfung beim Speichern und beim erneuten Laden von Suchvorlagen.
export function isValidPresetContent(name: string, query: string): boolean {
  return name.length > 0 && name.length <= 48 && query.length > 0
    && !CONTROL_CHARS.test(name) && !CONTROL_CHARS.test(query);
}

// Entspricht Rusts split_whitespace() und MAX_QUERY_TOKENS.
export function isSearchQueryWithinTokenLimit(query: string): boolean {
  return query.split(/\p{White_Space}+/u).filter(Boolean).length <= MAX_SEARCH_QUERY_TOKENS;
}

export function parsePresets(value: unknown): SearchPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const presets: SearchPreset[] = [];
  for (const candidate of value.slice(0, 100)) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const query = typeof item.query === "string" ? item.query.trim() : "";
    if (!isValidPresetContent(name, query) || query.length > 4096 || new TextEncoder().encode(query).length > 4096 || !isSearchQueryWithinTokenLimit(query)) continue;
    const key = name.toLocaleLowerCase("de-DE");
    if (seen.has(key)) continue;
    if (item.matchMode !== "all" && item.matchMode !== "any") continue;
    if (!Array.isArray(item.fileTypes) || item.fileTypes.length > FILE_KINDS.length) continue;
    if (!item.fileTypes.every((kind: unknown) => FILE_KINDS.includes(kind as SavedFileKind))) continue;
    presets.push({ name, query, matchMode: item.matchMode, fileTypes: [...new Set(item.fileTypes)] });
    seen.add(key);
    if (presets.length >= MAX_PRESETS) break;
  }
  return presets;
}

export function normalizeZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10));
}
