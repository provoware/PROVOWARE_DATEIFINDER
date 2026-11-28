/** Reuse locale formatters across virtual-list rerenders instead of rebuilding one per file. */
const PREVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const RESULT_ROW_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE");

function validDate(epochMs: number | null): Date | null {
  if (epochMs === null || !Number.isFinite(epochMs)) return null;
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a file timestamp for the user's locale; invalid timestamps stay unlabelled. */
export function formatDate(epochMs: number | null): string {
  const date = validDate(epochMs);
  return date === null ? "–" : PREVIEW_DATE_FORMATTER.format(date);
}

/** Compact date for each visible search-result row. */
export function formatResultRowDate(epochMs: number | null): string {
  const date = validDate(epochMs);
  return date === null ? "–" : RESULT_ROW_DATE_FORMATTER.format(date);
}
