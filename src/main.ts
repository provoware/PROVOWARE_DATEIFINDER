import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  pathKey: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: number | null;
  kind: string;
}

interface SearchRequest {
  sessionId: string;
  rootPathKey: string;
  query: string;
  batchSize: number;
  maxResults: number;
}

interface PickedRoot {
  path: string;
  pathKey: string;
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
  limitReached: boolean;
}

interface SearchCancelledPayload {
  sessionId: string;
}

interface AppState {
  query: string;
  sourcePath: string | null;
  sourcePathKey: string | null;
  sourceLabel: string;
  results: FileEntry[];
  selectedIds: Set<string>;
  previewId: string | null;
  sort: SortMode;
  searching: boolean;
  activeSessionId: string | null;
  scannedCount: number;
  skippedCount: number;
  limitReached: boolean;
  theme: Theme;
  platform: PlatformCapabilities;
}

const initialState: AppState = {
  query: "",
  sourcePath: null,
  sourcePathKey: null,
  sourceLabel: "Ordner wählen",
  results: [],
  selectedIds: new Set(),
  previewId: null,
  sort: "name-asc",
  searching: false,
  activeSessionId: null,
  scannedCount: 0,
  skippedCount: 0,
  limitReached: false,
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

function sortResults(items: FileEntry[], mode: SortMode): FileEntry[] {
  return [...items].sort(compareResults(mode));
}

function mergeSortedResults(existing: FileEntry[], incoming: FileEntry[], mode: SortMode): FileEntry[] {
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

function isTheme(value: unknown): value is Theme {
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

interface BrowserTestAdapter {
  getPlatformCapabilities(): Promise<PlatformCapabilities>;
  pickDirectory(): Promise<PickedRoot | null>;
  startSearch(request: SearchRequest): Promise<void>;
  cancelSearch(sessionId: string): Promise<void>;
  listenSearchEvents(listeners: SearchListeners): Promise<UnlistenFn[]>;
}

declare global {
  interface Window {
    __DATEIFINDER_TEST_ADAPTER__?: Partial<BrowserTestAdapter>;
  }
}

const browserTestAdapter = import.meta.env.MODE === "test" ? window.__DATEIFINDER_TEST_ADAPTER__ : undefined;
let searchEventsAvailable = false;

async function getPlatformCapabilities(): Promise<PlatformCapabilities> {
  if (browserTestAdapter?.getPlatformCapabilities) return browserTestAdapter.getPlatformCapabilities();
  return invoke<PlatformCapabilities>("platform_capabilities");
}

async function pickDirectory(): Promise<PickedRoot | null> {
  if (browserTestAdapter?.pickDirectory) return browserTestAdapter.pickDirectory();
  return invoke<PickedRoot | null>("pick_search_root");
}

async function startSearch(request: SearchRequest): Promise<void> {
  if (browserTestAdapter?.startSearch) return browserTestAdapter.startSearch(request);
  await invoke("start_search", { request });
}

async function cancelSearch(sessionId: string): Promise<void> {
  if (browserTestAdapter?.cancelSearch) return browserTestAdapter.cancelSearch(sessionId);
  await invoke("cancel_search", { sessionId });
}

async function openFile(rootPathKey: string, pathKey: string): Promise<void> {
  await invoke("open_file", { rootPathKey, pathKey });
}

async function revealFile(rootPathKey: string, pathKey: string): Promise<void> {
  await invoke("reveal_file", { rootPathKey, pathKey });
}

async function exportResults(lines: string[]): Promise<boolean> {
  return invoke<boolean>("export_results", { lines });
}

async function loadTheme(): Promise<Theme | null> {
  const value = await settings.get<string>("theme");
  return isTheme(value) ? value : null;
}

async function saveTheme(theme: Theme): Promise<void> {
  await settings.set("theme", theme);
  await settings.save();
}

async function listenSearchEvents(listeners: SearchListeners): Promise<UnlistenFn[]> {
  if (browserTestAdapter?.listenSearchEvents) return browserTestAdapter.listenSearchEvents(listeners);
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

const SEARCH_RESULT_LIMIT = 20_000;
const VIRTUAL_OVERSCAN_ROWS = 8;
const DEFAULT_RESULT_ROW_HEIGHT = 40;
let resultRenderScheduled = false;
let virtualRenderScheduled = false;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

const ui = {
  form: byId<HTMLFormElement>("search-form"),
  query: byId<HTMLInputElement>("query-input"),
  sourceLabel: byId<HTMLElement>("source-label"),
  sourceNav: byId<HTMLButtonElement>("choose-source-nav"),
  mobileSource: byId<HTMLButtonElement>("mobile-source-button"),
  results: byId<HTMLElement>("results-list"),
  resultCount: byId<HTMLElement>("result-count"),
  resultLimitNotice: byId<HTMLElement>("result-limit-notice"),
  empty: byId<HTMLElement>("empty-state"),
  statusTitle: byId<HTMLElement>("status-title"),
  statusDetail: byId<HTMLElement>("status-detail"),
  statusIcon: byId<HTMLElement>("status-icon"),
  statusProgress: byId<HTMLElement>("status-progress"),
  statusAnnouncer: byId<HTMLElement>("status-announcer"),
  selectionSummary: byId<HTMLElement>("selection-summary"),
  cancel: byId<HTMLButtonElement>("cancel-search"),
  open: byId<HTMLButtonElement>("open-selected"),
  reveal: byId<HTMLButtonElement>("reveal-selected"),
  export: byId<HTMLButtonElement>("export-results"),
  sort: byId<HTMLSelectElement>("sort-select"),
  theme: byId<HTMLSelectElement>("theme-select"),
  searchHelp: byId<HTMLDialogElement>("search-help-dialog"),
  previewName: byId<HTMLElement>("preview-name"),
  previewSummary: byId<HTMLElement>("preview-summary"),
  previewPath: byId<HTMLElement>("preview-path"),
  previewSize: byId<HTMLElement>("preview-size"),
  previewModified: byId<HTMLElement>("preview-modified"),
  previewKind: byId<HTMLElement>("preview-kind"),
};

function setStatus(
  title: string,
  detail: string,
  tone: "ready" | "working" | "warning" | "error" = "ready",
  announce = true,
): void {
  ui.statusTitle.textContent = title;
  ui.statusDetail.textContent = detail;
  ui.statusIcon.textContent = tone === "error" || tone === "warning" ? "!" : tone === "working" ? "…" : "✓";
  ui.statusIcon.dataset.tone = tone;
  ui.statusIcon.closest(".status-block")?.setAttribute("data-tone", tone);
  ui.statusProgress.hidden = tone !== "working";
  ui.statusProgress.setAttribute("aria-valuetext", tone === "working" ? detail : title);

  if (announce) {
    const message = `${title}. ${detail}`;
    if (ui.statusAnnouncer.textContent !== message) ui.statusAnnouncer.textContent = message;
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`;
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

function resultRowHeight(): number {
  const configured = Number.parseFloat(getComputedStyle(ui.results).getPropertyValue("--result-row-height"));
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RESULT_ROW_HEIGHT;
}

function visibleResultRange(): { start: number; end: number; rowHeight: number } {
  const rowHeight = resultRowHeight();
  const viewportRows = Math.max(1, Math.ceil(ui.results.clientHeight / rowHeight));
  const firstVisible = Math.floor(ui.results.scrollTop / rowHeight);
  const start = Math.max(0, firstVisible - VIRTUAL_OVERSCAN_ROWS);
  const end = Math.min(state.results.length, firstVisible + viewportRows + VIRTUAL_OVERSCAN_ROWS);
  return { start, end, rowHeight };
}

function focusResultAt(index: number): void {
  if (index < 0 || index >= state.results.length) return;
  const rowHeight = resultRowHeight();
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < ui.results.scrollTop) ui.results.scrollTop = top;
  if (bottom > ui.results.scrollTop + ui.results.clientHeight) {
    ui.results.scrollTop = Math.max(0, bottom - ui.results.clientHeight);
  }
  renderVisibleResultRows();
  const targetId = state.results[index]?.id;
  const target = [...ui.results.querySelectorAll<HTMLButtonElement>(".result-row")]
    .find((row) => row.dataset.fileId === targetId);
  target?.focus({ preventScroll: true });
}

function renderVisibleResultRows(): void {
  const focusedRow = document.activeElement instanceof HTMLElement
    ? document.activeElement.closest<HTMLButtonElement>(".result-row")
    : null;
  const focusedFileId = focusedRow?.dataset.fileId ?? null;
  const { start, end, rowHeight } = visibleResultRange();
  const canvas = document.createElement("div");
  canvas.className = "results-virtual-canvas";
  canvas.style.height = `${state.results.length * rowHeight}px`;

  for (let index = start; index < end; index += 1) {
    const file = state.results[index];
    if (!file) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "result-row";
    row.dataset.fileId = file.id;
    row.style.transform = `translateY(${index * rowHeight}px)`;
    row.setAttribute("aria-pressed", String(state.selectedIds.has(file.id)));
    row.setAttribute("aria-label", `${file.displayName}, Treffer ${index + 1} von ${state.results.length}`);

    const checkbox = document.createElement("span");
    checkbox.className = "row-check";
    checkbox.textContent = state.selectedIds.has(file.id) ? "✓" : "";
    checkbox.setAttribute("aria-hidden", "true");

    const icon = document.createElement("span");
    icon.className = `file-icon file-${file.kind}`;
    icon.setAttribute("aria-hidden", "true");
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
    row.addEventListener("keydown", (event) => {
      const targetIndex = event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? state.results.length - 1
              : null;
      if (targetIndex === null) return;
      event.preventDefault();
      state.previewId = state.results[targetIndex]?.id ?? state.previewId;
      focusResultAt(targetIndex);
    });

    canvas.append(row);
  }

  ui.results.replaceChildren(canvas);
  if (focusedFileId) {
    const replacementRow = [...ui.results.querySelectorAll<HTMLButtonElement>(".result-row")]
      .find((row) => row.dataset.fileId === focusedFileId);
    replacementRow?.focus({ preventScroll: true });
  }
}

function renderResults(): void {
  const limitSuffix = state.limitReached ? " · begrenzt" : "";
  ui.resultCount.textContent = `(${state.results.length} ${state.results.length === 1 ? "Datei" : "Dateien"}${limitSuffix})`;
  renderVisibleResultRows();

  ui.results.setAttribute("aria-busy", String(state.searching));
  ui.resultLimitNotice.hidden = !state.limitReached;
  ui.empty.hidden = state.results.length > 0 || state.searching;
  const selected = selectedFiles();
  const selectionText = selected.length === 0
    ? "Keine Datei ausgewählt."
    : selected.length === 1
      ? "1 Datei ausgewählt."
      : `${selected.length} Dateien ausgewählt.${selected.length > 10 ? " Beim Öffnen werden die ersten 10 verwendet." : ""}`;
  if (ui.selectionSummary.textContent !== selectionText) ui.selectionSummary.textContent = selectionText;

  ui.open.disabled = selected.length === 0 || !state.platform.canOpenFile;
  ui.open.textContent = selected.length > 10 ? "📂 Erste 10 öffnen" : selected.length === 1 ? "📂 Datei öffnen" : "📂 Ausgewählte öffnen";
  ui.open.title = selected.length > 10 ? `${selected.length} Dateien ausgewählt; geöffnet werden höchstens 10.` : "";
  ui.reveal.disabled = selected.length !== 1 || !state.platform.canRevealFile;
  ui.export.disabled = state.results.length === 0;
  ui.export.title = state.limitReached ? "Die gespeicherte Liste ist unvollständig, weil die Treffergrenze erreicht wurde." : "";
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

function scheduleVirtualRender(): void {
  if (virtualRenderScheduled) return;
  virtualRenderScheduled = true;
  requestAnimationFrame(() => {
    virtualRenderScheduled = false;
    renderVisibleResultRows();
  });
}

function render(): void {
  document.body.dataset.theme = state.theme;
  ui.theme.value = state.theme;
  ui.sourceLabel.textContent = state.sourceLabel;
  ui.cancel.disabled = !state.searching;
  renderResults();
}

function focusSourcePicker(): void {
  const target = [ui.sourceNav, ui.mobileSource].find((button) => button.offsetParent !== null && !button.disabled);
  target?.focus();
}

async function chooseSource(): Promise<void> {
  try {
    if (state.platform.canPickFolder) {
      const root = await pickDirectory();
      if (!root) return;
      state.sourcePath = root.path;
      state.sourcePathKey = root.pathKey;
      state.sourceLabel = root.path.split(/[\\/]/).filter(Boolean).at(-1) ?? root.path;
      setStatus("Suchort gewählt", state.sourceLabel);
      render();
      ui.query.focus();
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

  if (!searchEventsAvailable) {
    setStatus("Suche nicht verfügbar", "Die erforderlichen Suchereignisse konnten nicht registriert werden.", "error");
    return;
  }

  if (!query) {
    setStatus("Suchbegriff fehlt", "Bitte mindestens ein Wort eingeben.", "error");
    ui.query.focus();
    return;
  }

  if (!state.sourcePathKey) {
    setStatus("Suchort fehlt", "Bitte zuerst unter „Orte“ einen Ordner auswählen.", "error");
    focusSourcePicker();
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
  state.limitReached = false;
  ui.results.scrollTop = 0;
  state.searching = true;
  render();
  setStatus("Suche läuft", "Dateinamen werden geprüft …", "working");

  const sessionId = crypto.randomUUID();
  state.activeSessionId = sessionId;

  try {
    await startSearch({
      sessionId,
      rootPathKey: state.sourcePathKey,
      query,
      batchSize: 250,
      maxResults: SEARCH_RESULT_LIMIT,
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
      state.results = mergeSortedResults(state.results, payload.items, state.sort);
      state.scannedCount = payload.scannedCount;
      scheduleRenderResults();
    },
    onProgress(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.scannedCount = payload.scannedCount;
      setStatus(
        "Suche läuft",
        `${payload.scannedCount.toLocaleString("de-DE")} geprüft · ${state.results.length.toLocaleString("de-DE")} Treffer`,
        "working",
        false,
      );
    },
    onFinished(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.searching = false;
      state.activeSessionId = null;
      state.skippedCount = payload.skippedCount;
      state.limitReached = payload.limitReached;
      const skipped = payload.skippedCount > 0 ? ` · ${payload.skippedCount} übersprungen` : "";
      if (payload.limitReached) {
        ui.resultLimitNotice.textContent =
          `Treffergrenze erreicht: ${SEARCH_RESULT_LIMIT.toLocaleString("de-DE")} Dateien werden angezeigt. Weitere passende Dateien können vorhanden sein; Anzeige und Export sind unvollständig.`;
        setStatus(
          "Treffergrenze erreicht",
          `${payload.resultCount.toLocaleString("de-DE")} Treffer · Suche bewusst begrenzt · ${formatDuration(payload.durationMs)}${skipped}`,
          "warning",
        );
      } else {
        setStatus(
          `${payload.resultCount} ${payload.resultCount === 1 ? "Datei" : "Dateien"} gefunden`,
          `${payload.scannedCount.toLocaleString("de-DE")} geprüft · ${formatDuration(payload.durationMs)}${skipped}`,
        );
      }
      render();
    },
    onCancelled(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.searching = false;
      state.activeSessionId = null;
      setStatus("Suche abgebrochen", `${state.results.length} bisherige Treffer bleiben sichtbar.`);
      render();
    },
  }).then(() => {
    searchEventsAvailable = true;
  }).catch((error) => {
    console.error("Search events unavailable", error);
    setStatus("Suchereignisse nicht verfügbar", "Die Oberfläche bleibt bedienbar; Suchen ist derzeit nicht möglich.", "error");
  });

  ui.sourceNav.addEventListener("click", chooseSource);
  ui.mobileSource.addEventListener("click", chooseSource);
  byId<HTMLButtonElement>("search-help-button").addEventListener("click", () => ui.searchHelp.showModal());
  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void runSearch();
  });
  ui.cancel.addEventListener("click", () => {
    if (!state.activeSessionId) return;
    const sessionId = state.activeSessionId;
    ui.cancel.disabled = true;
    setStatus("Suche wird abgebrochen", `${state.scannedCount.toLocaleString("de-DE")} Einträge geprüft …`, "working");
    void cancelSearch(sessionId).catch((error) => {
      ui.cancel.disabled = false;
      setStatus("Abbruch fehlgeschlagen", `${safeMessage(error)} Bitte erneut versuchen.`, "error");
    });
  });
  ui.sort.addEventListener("change", () => {
    state.sort = ui.sort.value as SortMode;
    state.results = sortResults(state.results, state.sort);
    ui.results.scrollTop = 0;
    renderResults();
  });
  ui.results.addEventListener("scroll", scheduleVirtualRender, { passive: true });
  ui.theme.addEventListener("change", () => {
    if (!isTheme(ui.theme.value)) return;
    state.theme = ui.theme.value as Theme;
    void saveTheme(state.theme);
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-query-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.queryChip;
      if (!value) return;
      const parts = new Set(ui.query.value.trim().split(/\s+/).filter(Boolean));
      parts.add(value);
      ui.query.value = [...parts].join(" ");
      ui.query.focus();
    });
  });

  ui.open.addEventListener("click", async () => {
    if (!state.sourcePathKey) return;
    const files = selectedFiles().slice(0, 10);
    for (const file of files) {
      await openFile(state.sourcePathKey, file.pathKey).catch((error) =>
        setStatus("Datei konnte nicht geöffnet werden", safeMessage(error), "error"),
      );
    }
  });

  ui.reveal.addEventListener("click", async () => {
    if (!state.sourcePathKey) return;
    const file = selectedFiles()[0];
    if (!file) return;
    await revealFile(state.sourcePathKey, file.pathKey).catch((error) =>
      setStatus("Datei konnte nicht angezeigt werden", safeMessage(error), "error"),
    );
  });

  ui.export.addEventListener("click", async () => {
    const lines = state.results.map((file) => `${file.displayName}\t${file.path}\t${file.sizeBytes}`);
    const saved = await exportResults(lines).catch((error) => {
      setStatus("Liste konnte nicht gespeichert werden", safeMessage(error), "error");
      return false;
    });
    if (saved) {
      if (state.limitReached) {
        setStatus(
          "Unvollständige Liste gespeichert",
          `${state.results.length} Treffer exportiert; die Suche hatte die Treffergrenze erreicht.`,
          "warning",
        );
      } else {
        setStatus("Liste gespeichert", `${state.results.length} Treffer exportiert.`);
      }
    }
  });

  byId<HTMLButtonElement>("window-minimize").addEventListener("click", () => void minimizeWindow());
  byId<HTMLButtonElement>("window-maximize").addEventListener("click", () => void toggleMaximizeWindow());
  byId<HTMLButtonElement>("window-close").addEventListener("click", () => void closeWindow());

  render();
}

void initialize();
