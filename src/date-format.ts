/** Format a file timestamp for the user's locale; invalid timestamps stay unlabelled. */
export function formatDate(epochMs: number | null): string {
  if (epochMs === null || !Number.isFinite(epochMs)) return "–";
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
