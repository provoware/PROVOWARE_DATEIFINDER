import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";

type Theme = "cyan" | "purple" | "green" | "orange";
type SortMode = "name-asc" | "name-desc" | "size-desc" | "modified-desc";

interface PlatformCapabilities {
  platform: string;
  canPickFolder: boolean;
  canOpenFile: boolean;
  canRevealFile: boolean;
  canSearchRecursively: boolean;
  supportsPickedFiles: boolean;
}

interface FileEntry {
  id: string;
  displayName: string;
  path: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: number | null;
  kind: string;
}

interface SearchRequest {
  sessionId: string;
  rootPath: string;
  query: string;
  batchSize: number;
  maxResults: number;
}

interface SearchBatchPayload {
  sessionId: string;
  items: FileEntry[];
  scannedCount: number;
}

interface SearchProgressPayload {
  sessionId: string;
  scannedCount: number;
}

interface SearchFinishedPayload {
  sessionId: string;
  scannedCount: number;
  resultCount: number;
  skippedCount: number;
  durationMs: number;
}

interface SearchCancelledPayload {
  sessionId: string;
}

interface AppState {
  query: string;
  sourcePath: string | null;
  sourceLabel: string;
  results: FileEntry[];
  selectedIds: Set<string>;
  previewId: string | null;
  sort: SortMode;
  searching: boolean;
  activeSessionId: string | null;
  scannedCount: number;
  skippedCount: number;
  theme: Theme;
  platform: PlatformCapabilities;
}

const initialState: AppState = {
  query: "urlaub 2025",
  sourcePath: null,
  sourceLabel: "Ordner wählen",
  results: [],
  selectedIds: new Set(),
  previewId: null,
  sort: "name-asc",
  searching: false,
  activeSessionId: null,
  scannedCount: 0,
  skippedCount: 0,
  theme: "cyan",
  platform: {
    platform: "unknown",
    canPickFolder: false,
    canOpenFile: false,
    canRevealFile: false,
    canSearchRecursively: false,
    supportsPickedFiles: false,
  },
};

function sortResults(items: FileEntry[], mode: SortMode): FileEntry[] {
  const next = [...items];
  const byName = (a: FileEntry, b: FileEntry) =>
    a.displayName.localeCompare(b.displayName, "de", { numeric: true, sensitivity: "base" });

  switch (mode) {
    case "name-asc":
      return next.sort(byName);
    case "name-desc":
      return next.sort((a, b) => byName(b, a));
    case "size-desc":
      return next.sort((a, b) => b.sizeBytes - a.sizeBytes || byName(a, b));
    case "modified-desc":
      return next.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) || byName(a, b));
  }
}

function isTheme(value: string): value is Theme {
  return value === "cyan" || value === "purple" || value === "green" || value === "orange";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "–";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  const digits = value >= 10 ? 1 : 2;
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: digits })} ${unit}`;
}

function formatDate(epochMs: number | null): string {
  if (!epochMs) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(epochMs));
}

const settings = new LazyStore("settings.json");

interface SearchListeners {
  onBatch(payload: SearchBatchPayload): void;
  onProgress(payload: SearchProgressPayload): void;
  onFinished(payload: SearchFinishedPayload): void;
  onCancelled(payload: SearchCancelledPayload): void;
}

async function getPlatformCapabilities(): Promise<PlatformCapabilities> {
  return invoke<PlatformCapabilities>("platform_capabilities");
}

async function pickDirectory(): Promise<string | null> {
  return invoke<string | null>("pick_search_root");
}

async function pickFiles(): Promise<string[]> {
  const result = await open({
    directory: false,
    multiple: true,
    title: "Dateien auswählen",
  });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

async function startSearch(request: SearchRequest): Promise<void> {
  await invoke("start_search", { request });
}

async function cancelSearch(sessionId: string): Promise<void> {
  await invoke("cancel_search", { sessionId });
}

async function openFile(rootPath: string, path: string): Promise<void> {
  await invoke("open_file", { rootPath, path });
}

async function revealFile(rootPath: string, path: string): Promise<void> {
  await invoke("reveal_file", { rootPath, path });
}

async function exportResults(lines: string[]): Promise<boolean> {
  return invoke<boolean>("export_results", { lines });
}

async function loadTheme(): Promise<Theme | null> {
  const value = await settings.get<string>("theme");
  return value === "cyan" || value === "purple" || value === "green" || value === "orange"
    ? value
    : null;
}

async function saveTheme(theme: Theme): Promise<void> {
  await settings.set("theme", theme);
  await settings.save();
}

async function listenSearchEvents(listeners: SearchListeners): Promise<UnlistenFn[]> {
  return Promise.all([
    listen<SearchBatchPayload>("search-batch", ({ payload }) => listeners.onBatch(payload)),
    listen<SearchProgressPayload>("search-progress", ({ payload }) => listeners.onProgress(payload)),
    listen<SearchFinishedPayload>("search-finished", ({ payload }) => listeners.onFinished(payload)),
    listen<SearchCancelledPayload>("search-cancelled", ({ payload }) => listeners.onCancelled(payload)),
  ]);
}

async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

async function toggleMaximizeWindow(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}

const state: AppState = structuredClone(initialState);
state.selectedIds = new Set<string>();

const VISIBLE_RESULT_LIMIT = 2_000;
let resultRenderScheduled = false;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

const ui = {
  form: byId<HTMLFormElement>("search-form"),
  query: byId<HTMLInputElement>("query-input"),
  sourceLabel: byId<HTMLElement>("source-label"),
  results: byId<HTMLElement>("results-list"),
  resultCount: byId<HTMLElement>("result-count"),
  empty: byId<HTMLElement>("empty-state"),
  statusTitle: byId<HTMLElement>("status-title"),
  statusDetail: byId<HTMLElement>("status-detail"),
  statusIcon: byId<HTMLElement>("status-icon"),
  cancel: byId<HTMLButtonElement>("cancel-search"),
  open: byId<HTMLButtonElement>("open-selected"),
  reveal: byId<HTMLButtonElement>("reveal-selected"),
  export: byId<HTMLButtonElement>("export-results"),
  sort: byId<HTMLSelectElement>("sort-select"),
  theme: byId<HTMLSelectElement>("theme-select"),
  previewName: byId<HTMLElement>("preview-name"),
  previewSummary: byId<HTMLElement>("preview-summary"),
  previewPath: byId<HTMLElement>("preview-path"),
  previewSize: byId<HTMLElement>("preview-size"),
  previewModified: byId<HTMLElement>("preview-modified"),
  previewKind: byId<HTMLElement>("preview-kind"),
};

function setStatus(title: string, detail: string, tone: "ready" | "working" | "error" = "ready"): void {
  ui.statusTitle.textContent = title;
  ui.statusDetail.textContent = detail;
  ui.statusIcon.textContent = tone === "error" ? "!" : tone === "working" ? "…" : "✓";
  ui.statusIcon.dataset.tone = tone;
}

function currentPreview(): FileEntry | null {
  if (!state.previewId) return null;
  return state.results.find((item) => item.id === state.previewId) ?? null;
}

function selectedFiles(): FileEntry[] {
  return state.results.filter((item) => state.selectedIds.has(item.id));
}

function renderPreview(): void {
  const file = currentPreview();
  if (!file) {
    ui.previewName.textContent = "Keine Datei ausgewählt";
    ui.previewSummary.textContent = "–";
    ui.previewPath.textContent = "–";
    ui.previewSize.textContent = "–";
    ui.previewModified.textContent = "–";
    ui.previewKind.textContent = "–";
    return;
  }

  ui.previewName.textContent = file.displayName;
  ui.previewSummary.textContent = `${file.kind} · ${formatBytes(file.sizeBytes)}`;
  ui.previewPath.textContent = file.path;
  ui.previewSize.textContent = formatBytes(file.sizeBytes);
  ui.previewModified.textContent = formatDate(file.modifiedAt);
  ui.previewKind.textContent = file.extension ? file.extension.toUpperCase() : file.kind;
}

function renderResults(): void {
  state.results = sortResults(state.results, state.sort);
  const visibleCount = Math.min(state.results.length, VISIBLE_RESULT_LIMIT);
  const visibleSuffix = state.results.length > VISIBLE_RESULT_LIMIT ? ` · ${visibleCount} sichtbar` : "";
  ui.resultCount.textContent = `(${state.results.length} ${state.results.length === 1 ? "Datei" : "Dateien"}${visibleSuffix})`;
  ui.results.replaceChildren();

  for (const file of state.results.slice(0, VISIBLE_RESULT_LIMIT)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "result-row";
    row.dataset.fileId = file.id;
    row.setAttribute("aria-pressed", String(state.selectedIds.has(file.id)));

    const checkbox = document.createElement("span");
    checkbox.className = "row-check";
    checkbox.textContent = state.selectedIds.has(file.id) ? "✓" : "";

    const icon = document.createElement("span");
    icon.className = `file-icon file-${file.kind}`;
    icon.textContent = file.kind === "image" ? "▧" : file.kind === "audio" ? "♫" : file.kind === "document" ? "PDF" : "txt";

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.displayName;

    const path = document.createElement("span");
    path.className = "file-path";
    path.textContent = file.path;

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatBytes(file.sizeBytes);

    const date = document.createElement("span");
    date.className = "file-date";
    date.textContent = file.modifiedAt
      ? new Intl.DateTimeFormat("de-DE").format(new Date(file.modifiedAt))
      : "–";

    row.append(checkbox, icon, name, path, size, date);
    row.addEventListener("click", () => {
      if (state.selectedIds.has(file.id)) {
        state.selectedIds.delete(file.id);
      } else {
        state.selectedIds.add(file.id);
      }
      state.previewId = file.id;
      render();
    });

    ui.results.append(row);
  }

  ui.empty.hidden = state.results.length > 0 || state.searching;
  const selected = selectedFiles();
  ui.open.disabled = selected.length === 0 || !state.platform.canOpenFile;
  ui.reveal.disabled = selected.length !== 1 || !state.platform.canRevealFile;
  ui.export.disabled = state.results.length === 0;
  renderPreview();
}

function scheduleRenderResults(): void {
  if (resultRenderScheduled) return;
  resultRenderScheduled = true;
  requestAnimationFrame(() => {
    resultRenderScheduled = false;
    renderResults();
  });
}

function render(): void {
  document.body.dataset.theme = state.theme;
  ui.theme.value = state.theme;
  ui.sourceLabel.textContent = state.sourceLabel;
  ui.cancel.disabled = !state.searching;
  renderResults();
}

async function chooseSource(): Promise<void> {
  try {
    if (state.platform.canPickFolder) {
      const path = await pickDirectory();
      if (!path) return;
      state.sourcePath = path;
      state.sourceLabel = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
      setStatus("Suchort gewählt", state.sourceLabel);
      render();
      return;
    }

    if (state.platform.supportsPickedFiles) {
      const files = await pickFiles();
      if (files.length === 0) return;
      state.sourcePath = null;
      state.sourceLabel = `${files.length} Datei${files.length === 1 ? "" : "en"}`;
      setStatus("Mobile Quelle gewählt", "Dateisuche über ausgewählte Dateien folgt in der Mobile-Phase.");
      render();
      return;
    }

    setStatus("Nicht verfügbar", "Diese Plattform bietet aktuell keinen unterstützten Suchort.", "error");
  } catch (error) {
    setStatus("Quelle konnte nicht geöffnet werden", safeMessage(error), "error");
  }
}

async function runSearch(): Promise<void> {
  const query = ui.query.value.trim();
  state.query = query;

  if (!query) {
    setStatus("Suchbegriff fehlt", "Bitte mindestens ein Wort eingeben.", "error");
    ui.query.focus();
    return;
  }

  if (!state.sourcePath) {
    setStatus("Suchort fehlt", "Bitte zuerst unter „Orte“ einen Ordner auswählen.", "error");
    return;
  }

  if (state.activeSessionId) {
    await cancelSearch(state.activeSessionId).catch(() => undefined);
  }

  state.results = [];
  state.selectedIds.clear();
  state.previewId = null;
  state.scannedCount = 0;
  state.skippedCount = 0;
  state.searching = true;
  render();
  setStatus("Suche läuft", "Dateinamen werden geprüft …", "working");

  const sessionId = crypto.randomUUID();
  state.activeSessionId = sessionId;

  try {
    await startSearch({
      sessionId,
      rootPath: state.sourcePath,
      query,
      batchSize: 250,
      maxResults: 20_000,
    });
  } catch (error) {
    state.searching = false;
    state.activeSessionId = null;
    setStatus("Suche konnte nicht starten", safeMessage(error), "error");
    render();
  }
}

function safeMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unbekannter Fehler";
}

async function initialize(): Promise<void> {
  try {
    state.platform = await getPlatformCapabilities();
  } catch (error) {
    console.error("Platform capabilities unavailable", error);
    setStatus("Systemfunktionen nicht verfügbar", "Dateizugriffe bleiben aus Sicherheitsgründen deaktiviert.", "error");
  }

  const storedTheme = await loadTheme().catch(() => null);
  if (storedTheme) state.theme = storedTheme;

  await listenSearchEvents({
    onBatch(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.results.push(...payload.items);
      state.scannedCount = payload.scannedCount;
      scheduleRenderResults();
    },
    onProgress(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.scannedCount = payload.scannedCount;
      setStatus("Suche läuft", `${payload.scannedCount.toLocaleString("de-DE")} Einträge geprüft …`, "working");
    },
    onFinished(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.searching = false;
      state.activeSessionId = null;
      state.skippedCount = payload.skippedCount;
      const skipped = payload.skippedCount > 0 ? ` · ${payload.skippedCount} übersprungen` : "";
      setStatus(
        `${payload.resultCount} ${payload.resultCount === 1 ? "Datei" : "Dateien"} gefunden`,
        `${payload.scannedCount.toLocaleString("de-DE")} geprüft · ${payload.durationMs} ms${skipped}`,
      );
      render();
    },
    onCancelled(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.searching = false;
      state.activeSessionId = null;
      setStatus("Suche abgebrochen", `${state.results.length} bisherige Treffer bleiben sichtbar.`);
      render();
    },
  });

  byId<HTMLButtonElement>("choose-source-nav").addEventListener("click", chooseSource);
  byId<HTMLButtonElement>("mobile-source-button").addEventListener("click", chooseSource);
  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void runSearch();
  });
  ui.cancel.addEventListener("click", () => {
    if (state.activeSessionId) void cancelSearch(state.activeSessionId);
  });
  ui.sort.addEventListener("change", () => {
    state.sort = ui.sort.value as SortMode;
    renderResults();
  });
  ui.theme.addEventListener("change", () => {
    if (!isTheme(ui.theme.value)) return;
    state.theme = ui.theme.value as Theme;
    void saveTheme(state.theme);
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-query-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.queryChip;
      if (!value || value === "+") return;
      const parts = new Set(ui.query.value.trim().split(/\s+/).filter(Boolean));
      parts.add(value);
      ui.query.value = [...parts].join(" ");
      ui.query.focus();
    });
  });

  ui.open.addEventListener("click", async () => {
    if (!state.sourcePath) return;
    const files = selectedFiles().slice(0, 10);
    for (const file of files) {
      await openFile(state.sourcePath, file.path).catch((error) =>
        setStatus("Datei konnte nicht geöffnet werden", safeMessage(error), "error"),
      );
    }
  });

  ui.reveal.addEventListener("click", async () => {
    if (!state.sourcePath) return;
    const file = selectedFiles()[0];
    if (!file) return;
    await revealFile(state.sourcePath, file.path).catch((error) =>
      setStatus("Datei konnte nicht angezeigt werden", safeMessage(error), "error"),
    );
  });

  ui.export.addEventListener("click", async () => {
    const lines = state.results.map((file) => `${file.displayName}\t${file.path}\t${file.sizeBytes}`);
    const saved = await exportResults(lines).catch((error) => {
      setStatus("Liste konnte nicht gespeichert werden", safeMessage(error), "error");
      return false;
    });
    if (saved) setStatus("Liste gespeichert", `${state.results.length} Treffer exportiert.`);
  });

  byId<HTMLButtonElement>("window-minimize").addEventListener("click", () => void minimizeWindow());
  byId<HTMLButtonElement>("window-maximize").addEventListener("click", () => void toggleMaximizeWindow());
  byId<HTMLButtonElement>("window-close").addEventListener("click", () => void closeWindow());

  render();
}

void initialize();