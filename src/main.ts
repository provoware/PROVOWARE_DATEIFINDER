import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { LazyStore } from "@tauri-apps/plugin-store";
import { addFindingsBatch, createFindingsStats, insightGroups, type InsightMode } from "./findings-insights";
import { formatDate } from "./date-format";
import { MAX_PRESETS, normalizeZoom, parsePresets, type SearchPreset } from "./preferences";
import { isSearchQueryWithinByteLimit } from "./search-query";

type Theme = "cyan" | "purple" | "green" | "orange";
type SortMode = "name-asc" | "name-desc" | "size-desc" | "modified-desc";
type MatchMode = "all" | "any";
type FileKind = "image" | "document" | "audio" | "text";

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
  matchMode: MatchMode;
  fileTypes: FileKind[];
  searchContents: boolean;
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

type FileActionKind = "copy" | "move" | "zip";

interface FileActionRequest {
  sessionId: string;
  rootPathKey: string;
  pathKeys: string[];
  action: FileActionKind;
  newFolderName: string | null;
  archiveName: string | null;
}

interface FileActionResult {
  completed: number;
  destination: string;
}

interface FileActionProgress {
  sessionId: string;
  completed: number;
  total: number;
  bytesCompleted: number;
  bytesTotal: number;
  bytesPerSecond: number;
  phase: string;
}

interface AppState {
  query: string;
  matchMode: MatchMode;
  fileTypes: Set<FileKind>;
  searchContents: boolean;
  sourcePath: string | null;
  sourcePathKey: string | null;
  sourceLabel: string;
  lastSearchStatus: "not-started" | "finished" | "cancelled" | "failed";
  results: FileEntry[];
  selectedIds: Set<string>;
  previewId: string | null;
  sort: SortMode;
  searching: boolean;
  fileActionBusy: boolean;
  activeSessionId: string | null;
  scannedCount: number;
  elapsedMs: number;
  searchStartedAt: number | null;
  skippedCount: number;
  limitReached: boolean;
  theme: Theme;
  platform: PlatformCapabilities;
}

const initialState: AppState = {
  query: "",
  matchMode: "all",
  fileTypes: new Set<FileKind>(),
  searchContents: false,
  sourcePath: null,
  sourcePathKey: null,
  sourceLabel: "Ordner wählen",
  lastSearchStatus: "not-started",
  results: [],
  selectedIds: new Set(),
  previewId: null,
  sort: "name-asc",
  searching: false,
  fileActionBusy: false,
  activeSessionId: null,
  scannedCount: 0,
  elapsedMs: 0,
  searchStartedAt: null,
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
  inspectSavedRoot(path: string): Promise<boolean>;
  restoreSavedRoot(path: string): Promise<PickedRoot>;
  previewText(rootPathKey: string, pathKey: string): Promise<string>;
  importSearchPresets(): Promise<string | null>;
  exportSearchPresets(contents: string): Promise<boolean>;
  executeFileAction(request: FileActionRequest): Promise<FileActionResult | null>;
  cancelFileAction(sessionId: string): Promise<void>;
  listenFileActionProgress(listener: (payload: FileActionProgress) => void): Promise<UnlistenFn>;
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

async function inspectSavedRoot(path: string): Promise<boolean> {
  if (browserTestAdapter?.inspectSavedRoot) return browserTestAdapter.inspectSavedRoot(path);
  return invoke<boolean>("inspect_saved_root", { path });
}

async function restoreSavedRoot(path: string): Promise<PickedRoot> {
  if (browserTestAdapter?.restoreSavedRoot) return browserTestAdapter.restoreSavedRoot(path);
  return invoke<PickedRoot>("restore_saved_root", { path });
}

async function previewText(rootPathKey: string, pathKey: string): Promise<string> {
  if (browserTestAdapter?.previewText) return browserTestAdapter.previewText(rootPathKey, pathKey);
  return invoke<string>("preview_text", { rootPathKey, pathKey });
}

async function importSearchPresets(): Promise<string | null> {
  if (browserTestAdapter?.importSearchPresets) return browserTestAdapter.importSearchPresets();
  return invoke<string | null>("import_search_presets");
}

async function exportSearchPresets(contents: string): Promise<boolean> {
  if (browserTestAdapter?.exportSearchPresets) return browserTestAdapter.exportSearchPresets(contents);
  return invoke<boolean>("export_search_presets", { contents });
}

async function startSearch(request: SearchRequest): Promise<void> {
  if (browserTestAdapter?.startSearch) return browserTestAdapter.startSearch(request);
  await invoke("start_search", { request });
}

async function cancelSearch(sessionId: string): Promise<void> {
  if (browserTestAdapter?.cancelSearch) return browserTestAdapter.cancelSearch(sessionId);
  await invoke("cancel_search", { sessionId });
}

async function executeFileAction(request: FileActionRequest): Promise<FileActionResult | null> {
  if (browserTestAdapter?.executeFileAction) return browserTestAdapter.executeFileAction(request);
  return invoke<FileActionResult | null>("execute_file_action", { request });
}

async function cancelFileAction(sessionId: string): Promise<void> {
  if (browserTestAdapter?.cancelFileAction) return browserTestAdapter.cancelFileAction(sessionId);
  await invoke("cancel_file_action", { sessionId });
}

async function listenFileActionProgress(listener: (payload: FileActionProgress) => void): Promise<UnlistenFn> {
  if (browserTestAdapter?.listenFileActionProgress) return browserTestAdapter.listenFileActionProgress(listener);
  return listen<FileActionProgress>("file-action-progress", ({ payload }) => listener(payload));
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
  return value === "cyan" || value === "purple" || value === "green" || value === "orange"
    ? value
    : null;
}

async function saveTheme(theme: Theme): Promise<void> {
  await settings.set("theme", theme);
  await settings.save();
}

async function loadMatchMode(): Promise<MatchMode | null> {
  const value = await settings.get<string>("matchMode");
  return value === "all" || value === "any" ? value : null;
}

async function saveMatchMode(mode: MatchMode): Promise<void> {
  await settings.set("matchMode", mode);
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
state.fileTypes = new Set<FileKind>();

const SEARCH_RESULT_LIMIT = 20_000;
const VIRTUAL_OVERSCAN_ROWS = 8;
const DEFAULT_RESULT_ROW_HEIGHT = 40;
let resultRenderScheduled = false;
let virtualRenderScheduled = false;
let progressTimer: number | null = null;
let findingsStats = createFindingsStats();
let insightsMode: InsightMode = "type";
let insightsOpen = false;
let searchPresets: SearchPreset[] = [];
let currentZoom = 1;
let lastPreviewRequest = "";
let selectedAction: FileActionKind = "copy";
let activeFileActionSession: string | null = null;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

const ui = {
  form: byId<HTMLFormElement>("search-form"),
  query: byId<HTMLInputElement>("query-input"),
  matchMode: byId<HTMLSelectElement>("match-mode-select"),
  searchScopeNote: byId<HTMLElement>("search-scope-note"),
  fileTypeButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-file-type]")],
  sourceLabel: byId<HTMLElement>("source-label"),
  sourceNav: byId<HTMLButtonElement>("choose-source-nav"),
  mobileSource: byId<HTMLButtonElement>("mobile-source-button"),
  results: byId<HTMLElement>("results-list"),
  resultCount: byId<HTMLElement>("result-count"),
  resultLimitNotice: byId<HTMLElement>("result-limit-notice"),
  fileActionToolbar: byId<HTMLElement>("file-action-toolbar"),
  fileActionCount: byId<HTMLElement>("file-action-count"),
  actionCopy: byId<HTMLButtonElement>("action-copy"),
  actionMove: byId<HTMLButtonElement>("action-move"),
  actionZip: byId<HTMLButtonElement>("action-zip"),
  fileActionDialog: byId<HTMLDialogElement>("file-action-dialog"),
  fileActionTitle: byId<HTMLElement>("file-action-title"),
  fileActionDescription: byId<HTMLElement>("file-action-description"),
  fileActionSummary: byId<HTMLElement>("file-action-summary"),
  fileActionCreateFolder: byId<HTMLInputElement>("file-action-create-folder"),
  fileActionFolderLabel: byId<HTMLElement>("file-action-folder-label"),
  fileActionFolderName: byId<HTMLInputElement>("file-action-folder-name"),
  fileActionArchiveLabel: byId<HTMLElement>("file-action-archive-label"),
  fileActionArchiveName: byId<HTMLInputElement>("file-action-archive-name"),
  fileActionProgress: byId<HTMLElement>("file-action-progress"),
  fileActionProgressBar: byId<HTMLElement>("file-action-progress-bar"),
  fileActionByteDetail: byId<HTMLElement>("file-action-byte-detail"),
  fileActionFeedback: byId<HTMLElement>("file-action-feedback"),
  fileActionStart: byId<HTMLButtonElement>("file-action-start"),
  fileActionCancel: byId<HTMLButtonElement>("file-action-cancel"),
  insightsToggle: byId<HTMLButtonElement>("insights-toggle"),
  insightsPanel: byId<HTMLElement>("insights-panel"),
  insightsMode: byId<HTMLSelectElement>("insights-mode"),
  insightsTotal: byId<HTMLElement>("insights-total"),
  insightsChart: byId<HTMLElement>("insights-chart"),
  insightsLegend: byId<HTMLElement>("insights-legend"),
  empty: byId<HTMLElement>("empty-state"),
  emptyTitle: byId<HTMLElement>("empty-title"),
  emptyDetail: byId<HTMLElement>("empty-detail"),
  emptyAction: byId<HTMLButtonElement>("empty-action"),
  statusTitle: byId<HTMLElement>("status-title"),
  statusDetail: byId<HTMLElement>("status-detail"),
  statusIcon: byId<HTMLElement>("status-icon"),
  statusProgress: byId<HTMLElement>("status-progress"),
  statusAnnouncer: byId<HTMLElement>("status-announcer"),
  metricScanned: byId<HTMLElement>("metric-scanned"),
  metricFound: byId<HTMLElement>("metric-found"),
  metricElapsed: byId<HTMLElement>("metric-elapsed"),
  metricSpeed: byId<HTMLElement>("metric-speed"),
  metricFilter: byId<HTMLElement>("metric-filter"),
  selectionSummary: byId<HTMLElement>("selection-summary"),
  cancel: byId<HTMLButtonElement>("cancel-search"),
  open: byId<HTMLButtonElement>("open-selected"),
  reveal: byId<HTMLButtonElement>("reveal-selected"),
  export: byId<HTMLButtonElement>("export-results"),
  sort: byId<HTMLSelectElement>("sort-select"),
  theme: byId<HTMLSelectElement>("theme-select"),
  settingsDialog: byId<HTMLDialogElement>("settings-dialog"),
  settingsTheme: byId<HTMLSelectElement>("settings-theme-select"),
  settingsMatch: byId<HTMLSelectElement>("settings-match-select"),
  settingsZoom: byId<HTMLSelectElement>("settings-zoom"),
  settingsContentSearch: byId<HTMLInputElement>("settings-content-search"),
  presetsQuick: byId<HTMLButtonElement>("presets-quick"),
  presetName: byId<HTMLInputElement>("preset-name"),
  presetSelect: byId<HTMLSelectElement>("preset-select"),
  presetSave: byId<HTMLButtonElement>("preset-save"),
  presetLoad: byId<HTMLButtonElement>("preset-load"),
  presetDelete: byId<HTMLButtonElement>("preset-delete"),
  presetImport: byId<HTMLButtonElement>("preset-import"),
  presetExport: byId<HTMLButtonElement>("preset-export"),
  presetFeedback: byId<HTMLElement>("preset-feedback"),
  returnDialog: byId<HTMLDialogElement>("return-dialog"),
  returnPath: byId<HTMLElement>("return-path"),
  returnDetail: byId<HTMLElement>("return-detail"),
  returnUse: byId<HTMLButtonElement>("return-use"),
  returnChange: byId<HTMLButtonElement>("return-change"),
  returnLater: byId<HTMLButtonElement>("return-later"),
  searchHelp: byId<HTMLDialogElement>("search-help-dialog"),
  previewName: byId<HTMLElement>("preview-name"),
  previewVisual: byId<HTMLElement>("preview-visual"),
  textPreview: byId<HTMLElement>("text-preview"),
  previewSummary: byId<HTMLElement>("preview-summary"),
  previewPath: byId<HTMLElement>("preview-path"),
  copyPath: byId<HTMLButtonElement>("copy-path"),
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
  ui.statusProgress.setAttribute("aria-valuetext", tone === "working" ? `${state.scannedCount} Einträge geprüft; Gesamtzahl unbekannt` : title);

  if (announce) {
    const message = `${title}. ${detail}`;
    if (ui.statusAnnouncer.textContent !== message) ui.statusAnnouncer.textContent = message;
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`;
}

const kindLabels: Record<FileKind, string> = {
  image: "Bilder",
  document: "Dokumente",
  audio: "Audio",
  text: "Sonstige",
};

function showSavedPresets(): void {
  if (!ui.settingsDialog.open) ui.settingsDialog.showModal();
  ui.presetName.focus();
}

function renderPresets(selectedName?: string): void {
  const previous = selectedName ?? ui.presetSelect.value;
  ui.presetSelect.replaceChildren();
  const placeholder = new Option(searchPresets.length ? "Vorlage auswählen" : "Noch keine Vorlage", "");
  ui.presetSelect.add(placeholder);
  for (const preset of searchPresets) ui.presetSelect.add(new Option(preset.name, preset.name));
  ui.presetSelect.value = searchPresets.some((preset) => preset.name === previous) ? previous : "";
  ui.presetLoad.disabled = !ui.presetSelect.value || state.searching;
  ui.presetDelete.disabled = !ui.presetSelect.value;
  ui.presetExport.disabled = searchPresets.length === 0;
  ui.presetSave.disabled = state.searching;
  ui.presetsQuick.hidden = searchPresets.length === 0;
}

async function persistPresets(): Promise<void> {
  await settings.set("searchPresets", searchPresets);
  await settings.save();
}

function applyPreset(preset: SearchPreset): void {
  if (state.searching) return;
  ui.query.value = preset.query;
  state.query = preset.query;
  state.matchMode = preset.matchMode;
  state.fileTypes = new Set(preset.fileTypes);
  renderSearchOptions();
  renderMetrics();
  ui.settingsDialog.close();
  ui.query.focus();
  setStatus("Suchvorlage geladen", `„${preset.name}“ ist bereit. Zum Suchen auf „Suchen“ klicken.`);
}

async function changeZoom(value: number): Promise<void> {
  const next = normalizeZoom(value);
  if (next === currentZoom) return;
  try {
    if (browserTestAdapter) document.documentElement.style.zoom = String(next);
    else await getCurrentWebview().setZoom(next);
    currentZoom = next;
    ui.settingsZoom.value = String(next);
    scheduleVirtualRender();
  } catch (error) {
    ui.settingsZoom.value = String(currentZoom);
    setStatus("Zoom nicht verfügbar", safeMessage(error), "warning");
    return;
  }
  void settings.set("zoom", next).then(() => settings.save())
    .catch((error) => console.warn("Zoom konnte nicht dauerhaft gespeichert werden", error));
}

function renderSearchOptions(): void {
  ui.matchMode.value = state.matchMode;
  ui.matchMode.disabled = state.searching;
  ui.settingsMatch.value = state.matchMode;
  ui.settingsMatch.disabled = state.searching;
  ui.settingsTheme.value = state.theme;
  ui.settingsContentSearch.checked = state.searchContents;
  ui.settingsContentSearch.disabled = state.searching;
  ui.searchScopeNote.textContent = state.searchContents
    ? "Dateinamen + Textdateien bis 256 KB"
    : "Dateinamen · Unterordner inklusive";
  for (const button of ui.fileTypeButtons) {
    const kind = button.dataset.fileType;
    const selected = kind === "all" ? state.fileTypes.size === 0 : state.fileTypes.has(kind as FileKind);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = state.searching;
  }
}

function renderMetrics(): void {
  ui.metricScanned.textContent = state.scannedCount.toLocaleString("de-DE");
  ui.metricFound.textContent = state.results.length.toLocaleString("de-DE");
  ui.metricElapsed.textContent = formatDuration(state.elapsedMs);
  ui.metricSpeed.textContent = state.elapsedMs >= 250
    ? Math.round(state.scannedCount / (state.elapsedMs / 1_000)).toLocaleString("de-DE")
    : "–";
  const types = [...state.fileTypes].map((kind) => kindLabels[kind]);
  ui.metricFilter.textContent = types.length > 0 ? types.join(", ") : "Alle Typen";
  ui.metricFilter.title = `${ui.metricFilter.textContent} · ${state.matchMode === "all" ? "alle Wörter" : "mindestens ein Wort"}`;
  if (state.searchContents) ui.metricFilter.title += " · Inhaltssuche aktiv (Text bis 256 KB)";
}

function renderInsights(): void {
  const hasFindings = findingsStats.total > 0;
  ui.insightsToggle.hidden = !hasFindings;
  ui.insightsToggle.setAttribute("aria-expanded", String(hasFindings && insightsOpen));
  ui.insightsPanel.hidden = !hasFindings || !insightsOpen;
  if (!hasFindings || !insightsOpen) return;

  ui.insightsMode.value = insightsMode;
  const prefix = state.searching ? "Zwischenstand" : state.limitReached ? "Begrenzt" : "Angezeigt";
  ui.insightsTotal.textContent = `${prefix}: ${findingsStats.total.toLocaleString("de-DE")} · ${formatBytes(findingsStats.totalBytes)}`;

  const groups = insightGroups(findingsStats, insightsMode);
  const segments: HTMLElement[] = [];
  const legend: HTMLLIElement[] = [];
  for (const group of groups) {
    const percent = (group.count / findingsStats.total) * 100;
    const description = `${group.label}: ${group.count.toLocaleString("de-DE")} (${percent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %)`;
    const segment = document.createElement("span");
    segment.className = "insights-chart-segment";
    segment.style.flex = `0 0 ${percent}%`;
    segment.style.backgroundColor = group.color;
    segment.title = description;
    segment.setAttribute("aria-hidden", "true");
    segments.push(segment);

    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "insights-legend-swatch";
    swatch.style.backgroundColor = group.color;
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = `${group.label} `;
    const count = document.createElement("strong");
    count.textContent = group.count.toLocaleString("de-DE");
    item.append(swatch, label, count);
    item.title = description;
    legend.push(item);
  }
  ui.insightsChart.replaceChildren(...segments);
  ui.insightsChart.setAttribute("aria-label", `${findingsStats.total.toLocaleString("de-DE")} angezeigte Treffer: ${groups.map((group) => `${group.label} ${group.count}`).join(", ")}`);
  ui.insightsLegend.replaceChildren(...legend);
}

function stopProgressTimer(): void {
  if (progressTimer !== null) window.clearInterval(progressTimer);
  progressTimer = null;
  if (state.searchStartedAt !== null) state.elapsedMs = Date.now() - state.searchStartedAt;
  state.searchStartedAt = null;
}

function startProgressTimer(): void {
  stopProgressTimer();
  state.elapsedMs = 0;
  state.searchStartedAt = Date.now();
  progressTimer = window.setInterval(() => {
    if (state.searchStartedAt === null) return;
    state.elapsedMs = Date.now() - state.searchStartedAt;
    renderMetrics();
  }, 500);
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
    lastPreviewRequest = "";
    ui.previewVisual.hidden = false;
    ui.textPreview.hidden = true;
    ui.textPreview.textContent = "";
    ui.previewVisual.dataset.kind = "empty";
    ui.previewVisual.dataset.symbol = "⌕";
    ui.previewVisual.dataset.caption = "Datei auswählen";
    ui.previewName.textContent = "Keine Datei ausgewählt";
    ui.previewSummary.textContent = "Wähle einen Treffer aus, um Dateidetails zu sehen.";
    ui.previewPath.textContent = "–";
    ui.copyPath.hidden = true;
    ui.previewSize.textContent = "–";
    ui.previewModified.textContent = "–";
    ui.previewKind.textContent = "–";
    return;
  }

  const kindName = kindLabels[file.kind as FileKind] ?? "Datei";
  ui.previewVisual.dataset.kind = file.kind;
  ui.previewVisual.dataset.symbol = file.kind === "image" ? "▧"
    : file.kind === "audio" ? "♫"
      : (file.extension || "DAT").slice(0, 5).toUpperCase();
  ui.previewVisual.dataset.caption = kindName;
  ui.previewName.textContent = file.displayName;
  ui.previewSummary.textContent = `${kindName} · ${formatBytes(file.sizeBytes)}`;
  ui.previewPath.textContent = file.path;
  ui.copyPath.hidden = false;
  ui.previewSize.textContent = formatBytes(file.sizeBytes);
  ui.previewModified.textContent = formatDate(file.modifiedAt);
  ui.previewKind.textContent = file.extension ? file.extension.toUpperCase() : file.kind;

  const previewable = new Set(["txt", "md", "csv", "json", "log", "ini", "toml", "yaml", "yml", "xml", "html", "htm", "css", "js", "ts", "py", "rs", "sh", "conf"])
    .has(file.extension.toLowerCase());
  ui.previewVisual.hidden = previewable;
  ui.textPreview.hidden = !previewable;
  if (previewable && state.sourcePathKey) {
    const rootKey = state.sourcePathKey;
    const requestKey = `${rootKey}|${file.pathKey}`;
    if (lastPreviewRequest !== requestKey) {
      lastPreviewRequest = requestKey;
      ui.textPreview.textContent = "Textvorschau wird geladen …";
      void previewText(rootKey, file.pathKey).then((content) => {
        if (lastPreviewRequest !== requestKey) return;
        ui.textPreview.textContent = content.length > 20_000
          ? `${content.slice(0, 20_000)}\n\n… Vorschau auf 20.000 Zeichen gekürzt.`
          : content || "Diese Datei ist leer.";
      }).catch((error) => {
        if (lastPreviewRequest === requestKey) ui.textPreview.textContent = `Textvorschau nicht verfügbar: ${safeMessage(error)}`;
      });
    }
  }
}

function renderEmptyState(): void {
  if (!state.sourcePathKey) {
    ui.emptyTitle.textContent = "Noch kein Suchort gewählt.";
    ui.emptyDetail.textContent = "Wähle zuerst einen Ordner aus, den du durchsuchen möchtest.";
    ui.emptyAction.textContent = "📁 Ordner wählen";
  } else if (state.lastSearchStatus === "finished") {
    ui.emptyTitle.textContent = "Keine passenden Dateien gefunden.";
    ui.emptyDetail.textContent = "Versuche andere Suchwörter oder lockere die Dateitypfilter.";
    ui.emptyAction.textContent = "⌕ Suchbegriff ändern";
  } else if (state.lastSearchStatus === "cancelled") {
    ui.emptyTitle.textContent = "Suche abgebrochen.";
    ui.emptyDetail.textContent = "Starte mit einem neuen Suchbegriff, wenn du weitersuchen möchtest.";
    ui.emptyAction.textContent = "⌕ Erneut suchen";
  } else if (state.lastSearchStatus === "failed") {
    ui.emptyTitle.textContent = "Suche konnte nicht abgeschlossen werden.";
    ui.emptyDetail.textContent = "Prüfe den Hinweis unten und versuche es erneut.";
    ui.emptyAction.textContent = "⌕ Suchbegriff prüfen";
  } else {
    ui.emptyTitle.textContent = "Suchort bereit: " + state.sourceLabel;
    ui.emptyDetail.textContent = "Gib oben einen oder mehrere Suchbegriffe ein und starte die Suche.";
    ui.emptyAction.textContent = "⌕ Suchbegriff eingeben";
  }
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
    row.dataset.kind = file.kind === "image" || file.kind === "document" || file.kind === "audio" || file.kind === "text"
      ? file.kind : "other";
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
  renderEmptyState();
  const selected = selectedFiles();
  const canAct = selected.length > 0 && !state.searching && !state.fileActionBusy && Boolean(state.sourcePathKey)
    && selected.length <= 100 && state.platform.canPickFolder;
  ui.fileActionToolbar.hidden = selected.length === 0;
  ui.fileActionCount.textContent = `${selected.length.toLocaleString("de-DE")} ausgewählt`;
  for (const button of [ui.actionCopy, ui.actionMove, ui.actionZip]) {
    button.disabled = !canAct;
    button.title = selected.length > 100 ? "Pro Aktion sind höchstens 100 Dateien erlaubt." : "";
  }
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
  renderMetrics();
  renderInsights();
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
  renderSearchOptions();
  renderPresets();
  renderResults();
}

function validActionName(name: string): boolean {
  return name.length > 0 && name.length <= 100 && name === name.trim()
    && !name.startsWith(".") && !name.endsWith(".")
    && !/[\\/:*?"<>|\x00-\x1f\x7f]/.test(name);
}

function showFileAction(kind: FileActionKind): void {
  const selected = selectedFiles();
  if (!selected.length || selected.length > 100 || state.searching || state.fileActionBusy || !state.sourcePathKey) return;
  selectedAction = kind;
  ui.fileActionTitle.textContent = kind === "copy" ? "Dateien kopieren" : kind === "move" ? "Dateien verschieben" : "ZIP-Archiv erstellen";
  ui.fileActionDescription.textContent = kind === "move"
    ? "Quellen werden erst nach erfolgreicher Kopie und Nachprüfung entfernt."
    : "Die Originaldateien bleiben erhalten.";
  const totalBytes = selected.reduce((sum, file) => sum + file.sizeBytes, 0);
  ui.fileActionSummary.textContent = `${selected.length.toLocaleString("de-DE")} Dateien · ${formatBytes(totalBytes)} · max. 8 GB je Aktion`;
  ui.fileActionCreateFolder.checked = false;
  ui.fileActionFolderLabel.hidden = true;
  ui.fileActionFolderName.value = "";
  ui.fileActionArchiveLabel.hidden = kind !== "zip";
  ui.fileActionArchiveName.value = "DateiFinder-Auswahl.zip";
  ui.fileActionProgress.hidden = true;
  ui.fileActionByteDetail.hidden = true;
  ui.fileActionFeedback.textContent = "Zielordner wird vor dem Start von dir ausgewählt.";
  ui.fileActionStart.disabled = false;
  ui.fileActionStart.textContent = "Zielordner wählen und starten";
  ui.fileActionCancel.textContent = "Schließen";
  ui.fileActionDialog.showModal();
}

function showFileActionProgress({ completed, total, bytesCompleted, bytesTotal, bytesPerSecond, phase }: FileActionProgress): void {
  const byteFraction = bytesTotal > 0 ? Math.min(1, bytesCompleted / bytesTotal)
    : Math.min(1, completed / Math.max(1, total));
  const percent = phase === "ZIP: Archiv wird geprüft" ? 95
    : phase === "ZIP: Archiv wird erstellt" ? 85
      : phase === "ZIP: Dateien vorbereitet" ? Math.min(80, Math.round(80 * byteFraction))
        : completed < total ? Math.min(99, Math.round(100 * byteFraction)) : Math.round(100 * byteFraction);
  const speed = Number.isFinite(bytesPerSecond) && bytesPerSecond >= 0 ? bytesPerSecond : 0;
  const remaining = Math.max(0, bytesTotal - bytesCompleted);
  const eta = speed > 0 && remaining > 0 && !phase.startsWith("ZIP: Archiv")
    ? ` · Rest ca. ${Math.ceil(remaining / speed).toLocaleString("de-DE")} s` : "";
  const detail = `${formatBytes(bytesCompleted)} von ${formatBytes(bytesTotal)} · Ø ${formatBytes(speed)}/s${eta}`;
  ui.fileActionProgress.hidden = false;
  ui.fileActionProgress.setAttribute("aria-valuenow", String(percent));
  ui.fileActionProgress.setAttribute("aria-valuetext", `${completed} von ${total} Dateien · ${detail} · ${phase}`);
  ui.fileActionProgressBar.style.width = `${percent}%`;
  ui.fileActionByteDetail.hidden = false;
  ui.fileActionByteDetail.textContent = detail;
  ui.fileActionFeedback.textContent = `${phase}: ${completed} von ${total} Dateien.`;
  setStatus("Dateiaktion läuft", `${phase} · ${detail}`, "working", false);
}

async function requestFileActionCancel(): Promise<void> {
  if (!activeFileActionSession) return;
  ui.fileActionCancel.disabled = true;
  ui.fileActionFeedback.textContent = "Abbruch angefordert. Die aktuelle Datei wird sicher beendet …";
  try {
    await cancelFileAction(activeFileActionSession);
  } catch (error) {
    ui.fileActionFeedback.textContent = `Abbruch konnte nicht angefordert werden: ${safeMessage(error)}`;
  } finally {
    ui.fileActionCancel.disabled = false;
  }
}

async function startFileAction(): Promise<void> {
  if (state.fileActionBusy || state.searching || !state.sourcePathKey) return;
  const files = selectedFiles();
  if (!files.length || files.length > 100) return;
  const newFolderName = ui.fileActionCreateFolder.checked ? ui.fileActionFolderName.value : null;
  const archiveName = selectedAction === "zip" ? ui.fileActionArchiveName.value : null;
  if ((newFolderName !== null && !validActionName(newFolderName))
    || (archiveName !== null && (!validActionName(archiveName) || !archiveName.toLowerCase().endsWith(".zip")))) {
    ui.fileActionFeedback.textContent = "Bitte einen gültigen Namen ohne Schrägstrich oder Sonderzeichen eingeben.";
    return;
  }
  const request: FileActionRequest = {
    sessionId: crypto.randomUUID(), rootPathKey: state.sourcePathKey,
    pathKeys: files.map((file) => file.pathKey), action: selectedAction, newFolderName, archiveName,
  };
  state.fileActionBusy = true;
  activeFileActionSession = request.sessionId;
  ui.fileActionStart.disabled = true;
  ui.fileActionCancel.textContent = "■ Abbrechen";
  ui.fileActionCreateFolder.disabled = true;
  ui.fileActionFolderName.disabled = true;
  ui.fileActionArchiveName.disabled = true;
  ui.fileActionFeedback.textContent = "Bitte im Systemdialog den Zielordner auswählen. Abbrechen ist möglich.";
  render();
  try {
    const result = await executeFileAction(request);
    if (result === null) {
      ui.fileActionFeedback.textContent = "Zielauswahl abgebrochen. Keine Datei verändert.";
      setStatus("Dateiaktion nicht gestartet", "Es wurde kein Zielordner gewählt.");
    } else {
      ui.fileActionProgress.hidden = false;
      ui.fileActionProgress.setAttribute("aria-valuenow", "100");
      ui.fileActionProgress.setAttribute("aria-valuetext", "Erfolgreich abgeschlossen und geprüft");
      ui.fileActionProgressBar.style.width = "100%";
      ui.fileActionFeedback.textContent = `✓ ${result.completed} Datei(en) erfolgreich geprüft und gespeichert: ${result.destination}`;
      setStatus("Dateiaktion abgeschlossen", `${result.completed} Datei(en) · ${result.destination}`);
      if (selectedAction === "move") {
        // Nach dem Verschieben wären die alten Trefferpfade ungültig.
        const movedIds = new Set(files.map((file) => file.id));
        state.results = state.results.filter((file) => !movedIds.has(file.id));
        findingsStats = createFindingsStats();
        addFindingsBatch(findingsStats, state.results);
        state.previewId = null;
      }
      for (const file of files) state.selectedIds.delete(file.id);
    }
  } catch (error) {
    const message = safeMessage(error);
    const partial = selectedAction === "move" ? /^(\d+) von \d+ Dateien abgeschlossen\./.exec(message) : null;
    const completed = partial ? Number(partial[1]) : 0;
    if (completed > 0 && completed <= files.length) {
      // Nur bestätigte Teilabschlüsse ausblenden, damit keine ungültigen
      // Originalpfade in der Trefferliste stehen bleiben.
      const completedIds = new Set(files.slice(0, completed).map((file) => file.id));
      state.results = state.results.filter((file) => !completedIds.has(file.id));
      for (const id of completedIds) state.selectedIds.delete(id);
      findingsStats = createFindingsStats();
      addFindingsBatch(findingsStats, state.results);
      state.previewId = null;
    }
    ui.fileActionFeedback.textContent = `⚠ ${message} Originale und Ziel bitte prüfen.${completed > 0 ? " Bereits verschobene Treffer wurden aus der Liste genommen." : ""} Suche anschließend erneut starten.`;
    setStatus("Dateiaktion nicht vollständig", message, "warning");
  } finally {
    activeFileActionSession = null;
    state.fileActionBusy = false;
    ui.fileActionStart.disabled = false;
    ui.fileActionCreateFolder.disabled = false;
    ui.fileActionFolderName.disabled = false;
    ui.fileActionArchiveName.disabled = false;
    ui.fileActionCancel.textContent = "Schließen";
    render();
  }
}

function focusSourcePicker(): void {
  const target = [ui.sourceNav, ui.mobileSource].find((button) => button.offsetParent !== null && !button.disabled);
  target?.focus();
}

async function chooseSource(): Promise<void> {
  try {
    if (state.fileActionBusy) {
      setStatus("Dateiaktion läuft", "Bitte die Dateiaktion erst beenden oder abbrechen.", "warning");
      return;
    }
    if (state.searching) {
      setStatus("Suche läuft", "Bitte laufende Suche zuerst abbrechen, bevor du den Suchordner wechselst.", "warning");
      return;
    }
    if (state.platform.canPickFolder) {
      const root = await pickDirectory();
      if (!root) return;
      useSourceRoot(root);
      return;
    }

    setStatus("Nicht verfügbar", "Diese Plattform bietet aktuell keinen unterstützten Suchort.", "error");
  } catch (error) {
    setStatus("Quelle konnte nicht geöffnet werden", safeMessage(error), "error");
  }
}

function useSourceRoot(root: PickedRoot): void {
  state.results = [];
  findingsStats = createFindingsStats();
  state.selectedIds.clear();
  state.previewId = null;
  state.scannedCount = 0;
  state.elapsedMs = 0;
  state.skippedCount = 0;
  state.limitReached = false;
  state.lastSearchStatus = "not-started";
  ui.results.scrollTop = 0;
  state.sourcePath = root.path;
  state.sourcePathKey = root.pathKey;
  state.sourceLabel = root.path.split(/[\\/]/).filter(Boolean).at(-1) ?? root.path;
  void settings.set("lastRoot", root.path).then(() => settings.save())
    .catch((error) => console.warn("Letzter Suchort konnte nicht gespeichert werden", error));
  setStatus("Suchort gewählt", state.sourceLabel);
  render();
  ui.query.focus();
}

async function runSearch(): Promise<void> {
  if (state.fileActionBusy) {
    setStatus("Dateiaktion läuft", "Bitte vor der nächsten Suche die Dateiaktion abschließen.", "warning");
    return;
  }
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

  if (!isSearchQueryWithinByteLimit(query)) {
    setStatus("Suchbegriff zu lang", "Maximal 4.096 Byte in UTF-8 erlaubt. Bitte den Suchbegriff kürzen.", "error");
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

  void settings.set("lastQuery", query).then(() => settings.save())
    .catch((error) => console.warn("Letzte Suche konnte nicht gespeichert werden", error));

  state.results = [];
  findingsStats = createFindingsStats();
  insightsOpen = window.matchMedia("(min-width: 1200px)").matches;
  state.selectedIds.clear();
  state.previewId = null;
  state.scannedCount = 0;
  state.elapsedMs = 0;
  state.skippedCount = 0;
  state.limitReached = false;
  state.lastSearchStatus = "not-started";
  ui.results.scrollTop = 0;
  state.searching = true;
  startProgressTimer();
  render();
  setStatus("Suche läuft", state.searchContents
    ? "Dateinamen und Inhalte lesbarer Textdateien werden geprüft …"
    : "Dateinamen werden geprüft …", "working");

  const sessionId = crypto.randomUUID();
  state.activeSessionId = sessionId;

  try {
    await startSearch({
      sessionId,
      rootPathKey: state.sourcePathKey,
      query,
      matchMode: state.matchMode,
      fileTypes: [...state.fileTypes],
      searchContents: state.searchContents,
      batchSize: 250,
      maxResults: SEARCH_RESULT_LIMIT,
    });
  } catch (error) {
    stopProgressTimer();
    state.searching = false;
    state.activeSessionId = null;
    state.lastSearchStatus = "failed";
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
  const storedMatchMode = await loadMatchMode().catch(() => null);
  if (storedMatchMode) state.matchMode = storedMatchMode;

  const [storedPresets, storedZoom, storedRoot, storedQuery, storedContentSearch] = await Promise.all([
    settings.get<unknown>("searchPresets").catch(() => null),
    settings.get<unknown>("zoom").catch(() => null),
    settings.get<unknown>("lastRoot").catch(() => null),
    settings.get<unknown>("lastQuery").catch(() => null),
    settings.get<unknown>("searchContents").catch(() => null),
  ]);
  searchPresets = parsePresets(storedPresets);
  state.searchContents = storedContentSearch === true;
  renderPresets();
  if (typeof storedQuery === "string" && storedQuery.length <= 4096) ui.query.value = storedQuery;
  const preferredZoom = normalizeZoom(storedZoom);
  if (preferredZoom !== 1) await changeZoom(preferredZoom);

  await listenSearchEvents({
    onBatch(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      addFindingsBatch(findingsStats, payload.items);
      state.results = mergeSortedResults(state.results, payload.items, state.sort);
      state.scannedCount = payload.scannedCount;
      scheduleRenderResults();
    },
    onProgress(payload) {
      if (payload.sessionId !== state.activeSessionId) return;
      state.scannedCount = payload.scannedCount;
      renderMetrics();
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
      stopProgressTimer();
      state.activeSessionId = null;
      state.scannedCount = payload.scannedCount;
      state.elapsedMs = payload.durationMs;
      state.skippedCount = payload.skippedCount;
      state.limitReached = payload.limitReached;
      state.lastSearchStatus = "finished";
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
      stopProgressTimer();
      state.activeSessionId = null;
      state.lastSearchStatus = "cancelled";
      setStatus("Suche abgebrochen", `${state.results.length} bisherige Treffer bleiben sichtbar.`);
      render();
    },
  }).then(() => {
    searchEventsAvailable = true;
  }).catch((error) => {
    console.error("Search events unavailable", error);
    setStatus("Suchereignisse nicht verfügbar", "Die Oberfläche bleibt bedienbar; Suchen ist derzeit nicht möglich.", "error");
  });

  void listenFileActionProgress((payload) => {
    if (payload.sessionId !== activeFileActionSession) return;
    showFileActionProgress(payload);
  }).catch((error) => {
    console.error("File action progress unavailable", error);
    setStatus("Dateiaktionen nicht verfügbar", "Fortschrittsanzeige konnte nicht verbunden werden. Bitte neu starten.", "error");
  });

  ui.actionCopy.addEventListener("click", () => showFileAction("copy"));
  ui.actionMove.addEventListener("click", () => showFileAction("move"));
  ui.actionZip.addEventListener("click", () => showFileAction("zip"));
  ui.fileActionCreateFolder.addEventListener("change", () => {
    ui.fileActionFolderLabel.hidden = !ui.fileActionCreateFolder.checked;
  });
  ui.fileActionStart.addEventListener("click", () => void startFileAction());
  ui.fileActionCancel.addEventListener("click", () => {
    if (state.fileActionBusy) void requestFileActionCancel();
    else ui.fileActionDialog.close();
  });
  ui.fileActionDialog.addEventListener("cancel", (event) => {
    if (!state.fileActionBusy) return;
    event.preventDefault();
    void requestFileActionCancel();
  });

  ui.sourceNav.addEventListener("click", chooseSource);
  ui.mobileSource.addEventListener("click", chooseSource);
  ui.returnUse.addEventListener("click", async () => {
    const path = ui.returnPath.textContent?.trim() ?? "";
    ui.returnUse.disabled = true;
    try {
      const root = await restoreSavedRoot(path);
      ui.returnDialog.close();
      useSourceRoot(root);
    } catch (error) {
      ui.returnDetail.textContent = `Der alte Suchort konnte nicht übernommen werden: ${safeMessage(error)} Bitte anderen Ordner wählen.`;
      ui.returnUse.disabled = true;
    }
  });
  ui.returnChange.addEventListener("click", () => {
    ui.returnDialog.close();
    void chooseSource();
  });
  ui.returnLater.addEventListener("click", () => ui.returnDialog.close());
  ui.emptyAction.addEventListener("click", () => {
    if (!state.sourcePathKey) void chooseSource();
    else ui.query.focus();
  });
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
  ui.insightsToggle.addEventListener("click", () => {
    insightsOpen = !insightsOpen;
    renderInsights();
    scheduleVirtualRender();
  });
  ui.insightsMode.addEventListener("change", () => {
    const next = ui.insightsMode.value;
    if (next !== "type" && next !== "year" && next !== "size") return;
    insightsMode = next;
    renderInsights();
    scheduleVirtualRender();
  });
  ui.results.addEventListener("scroll", scheduleVirtualRender, { passive: true });
  new ResizeObserver(scheduleVirtualRender).observe(ui.results);
  function changeMatchMode(mode: string): void {
    if (mode !== "all" && mode !== "any") return;
    state.matchMode = mode;
    renderSearchOptions();
    renderMetrics();
    void saveMatchMode(mode).catch((error) => console.warn("Suchmodus konnte nicht gespeichert werden", error));
  }
  ui.matchMode.addEventListener("change", () => changeMatchMode(ui.matchMode.value));
  ui.settingsMatch.addEventListener("change", () => changeMatchMode(ui.settingsMatch.value));
  ui.fileTypeButtons.forEach((button) => button.addEventListener("click", () => {
    if (state.searching) return;
    const kind = button.dataset.fileType;
    if (kind === "all") state.fileTypes.clear();
    else if (kind === "image" || kind === "document" || kind === "audio" || kind === "text") {
      if (state.fileTypes.has(kind)) state.fileTypes.delete(kind);
      else state.fileTypes.add(kind);
    }
    renderSearchOptions();
    renderMetrics();
  }));

  byId<HTMLButtonElement>("nav-file-types").addEventListener("click", () => {
    const first = ui.fileTypeButtons[0];
    first?.scrollIntoView({ block: "nearest", inline: "nearest" });
    first?.focus();
  });
  const showSettings = () => ui.settingsDialog.showModal();
  byId<HTMLButtonElement>("settings-button").addEventListener("click", showSettings);
  byId<HTMLButtonElement>("nav-settings").addEventListener("click", showSettings);
  ui.presetsQuick.addEventListener("click", showSavedPresets);
  ui.presetSelect.addEventListener("change", () => renderPresets());
  ui.presetSave.addEventListener("click", async () => {
    const name = (ui.presetName.value.trim() || ui.query.value.trim().slice(0, 48)).trim();
    const query = ui.query.value.trim();
    if (!name || !query || !isSearchQueryWithinByteLimit(query)) {
      ui.presetFeedback.textContent = "Bitte erst Suchwörter und einen kurzen Namen eingeben.";
      return;
    }
    const existing = searchPresets.findIndex((preset) => preset.name.toLocaleLowerCase("de-DE") === name.toLocaleLowerCase("de-DE"));
    if (existing < 0 && searchPresets.length >= MAX_PRESETS) {
      ui.presetFeedback.textContent = `Maximal ${MAX_PRESETS} Vorlagen. Bitte eine alte Vorlage entfernen.`;
      return;
    }
    if (existing >= 0 && !window.confirm(`Suchvorlage „${name}“ durch die aktuelle Suche ersetzen?`)) return;
    const preset: SearchPreset = { name, query, matchMode: state.matchMode, fileTypes: [...state.fileTypes] };
    const former = [...searchPresets];
    if (existing >= 0) searchPresets[existing] = preset;
    else searchPresets.push(preset);
    try {
      await persistPresets();
      renderPresets(name);
      ui.presetFeedback.textContent = `„${name}“ wurde gespeichert.`;
    } catch (error) {
      searchPresets = former;
      renderPresets();
      ui.presetFeedback.textContent = `Speichern fehlgeschlagen: ${safeMessage(error)}`;
    }
  });
  ui.presetLoad.addEventListener("click", () => {
    const preset = searchPresets.find((item) => item.name === ui.presetSelect.value);
    if (preset) applyPreset(preset);
  });
  ui.presetDelete.addEventListener("click", async () => {
    const name = ui.presetSelect.value;
    if (!name || !window.confirm(`Suchvorlage „${name}“ wirklich entfernen?`)) return;
    const former = searchPresets;
    searchPresets = former.filter((preset) => preset.name !== name);
    try {
      await persistPresets();
      renderPresets();
      ui.presetFeedback.textContent = `„${name}“ wurde entfernt.`;
    } catch (error) {
      searchPresets = former;
      renderPresets(name);
      ui.presetFeedback.textContent = `Entfernen fehlgeschlagen: ${safeMessage(error)}`;
    }
  });
  ui.presetImport.addEventListener("click", async () => {
    try {
      const contents = await importSearchPresets();
      if (contents === null) return;
      const parsed = parsePresets(JSON.parse(contents) as unknown);
      if (parsed.length === 0) {
        ui.presetFeedback.textContent = "Diese Datei enthält keine gültigen Suchvorlagen.";
        return;
      }
      const existing = new Set(searchPresets.map((preset) => preset.name.toLocaleLowerCase("de-DE")));
      const additions = parsed.filter((preset) => !existing.has(preset.name.toLocaleLowerCase("de-DE")))
        .slice(0, MAX_PRESETS - searchPresets.length);
      if (!additions.length) {
        ui.presetFeedback.textContent = "Keine neuen Vorlagen. Gleiche Namen werden nicht überschrieben.";
        return;
      }
      const former = searchPresets;
      searchPresets = [...former, ...additions];
      try {
        await persistPresets();
        renderPresets();
        ui.presetFeedback.textContent = `${additions.length} Vorlage(n) importiert. Vorhandene blieben unverändert.`;
      } catch (error) {
        searchPresets = former;
        throw error;
      }
    } catch (error) {
      ui.presetFeedback.textContent = `Import fehlgeschlagen: ${safeMessage(error)}`;
    }
  });
  ui.presetExport.addEventListener("click", async () => {
    try {
      const saved = await exportSearchPresets(JSON.stringify(searchPresets, null, 2));
      if (saved) ui.presetFeedback.textContent = `${searchPresets.length} Vorlage(n) exportiert.`;
    } catch (error) {
      ui.presetFeedback.textContent = `Export fehlgeschlagen: ${safeMessage(error)}`;
    }
  });
  ui.settingsZoom.addEventListener("change", () => void changeZoom(Number(ui.settingsZoom.value)));
  ui.settingsContentSearch.addEventListener("change", () => {
    if (state.searching) return;
    state.searchContents = ui.settingsContentSearch.checked;
    void settings.set("searchContents", state.searchContents).then(() => settings.save())
      .catch((error) => console.warn("Inhaltssucheinstellung konnte nicht gespeichert werden", error));
    setStatus(state.searchContents ? "Inhaltssuche eingeschaltet" : "Nur Dateinamen", state.searchContents
      ? "Die nächste Suche prüft zusätzlich lesbare Textdateien bis 256 KB. Das kann länger dauern."
      : "Die nächste Suche prüft nur Dateinamen.");
  });
  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    void changeZoom(currentZoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false });
  window.addEventListener("keydown", (event) => {
    if (!event.ctrlKey || event.altKey) return;
    if (event.key === "0") { event.preventDefault(); void changeZoom(1); }
    if (event.shiftKey && event.key.toLowerCase() === "s") { event.preventDefault(); showSavedPresets(); }
  });
  function changeTheme(value: string): void {
    if (!isTheme(value)) return;
    state.theme = value;
    void saveTheme(state.theme).catch((error) => console.warn("Farbschema konnte nicht gespeichert werden", error));
    render();
  }
  ui.theme.addEventListener("change", () => {
    changeTheme(ui.theme.value);
  });
  ui.settingsTheme.addEventListener("change", () => changeTheme(ui.settingsTheme.value));

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

  ui.copyPath.addEventListener("click", async () => {
    const file = currentPreview();
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.path);
      setStatus("Pfad kopiert", "Der vollständige Dateipfad ist in der Zwischenablage.");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ui.previewPath);
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus("Dateipfad markiert", "Drücke Strg + C, um den ausgewählten Pfad zu kopieren.", "warning");
    }
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
  if (typeof storedRoot === "string" && storedRoot.length > 0 && storedRoot.length <= 32_768 && state.platform.canPickFolder) {
    ui.returnPath.textContent = storedRoot;
    ui.returnDetail.textContent = "Prüfung läuft: Ist der Ordner noch vorhanden und lesbar?";
    ui.returnUse.disabled = true;
    ui.returnDialog.showModal();
    void inspectSavedRoot(storedRoot).then((valid) => {
      if (!ui.returnDialog.open || ui.returnPath.textContent !== storedRoot) return;
      ui.returnUse.disabled = !valid;
      ui.returnDetail.textContent = valid
        ? "Der Ordner ist erreichbar. Du kannst ihn für diese Sitzung erneut freigeben oder einen anderen wählen."
        : "Der Ordner fehlt oder ist nicht lesbar. Bitte einen anderen Ordner wählen.";
    }).catch(() => {
      ui.returnDetail.textContent = "Der Ordner konnte nicht geprüft werden. Bitte einen anderen wählen.";
    });
  }
}

void initialize();
