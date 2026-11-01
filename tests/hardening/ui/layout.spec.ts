import { expect, test } from "@playwright/test";
import { formatExportLine } from "../../../src/export-lines";

const themes = ["cyan", "purple", "green", "orange"] as const;

test("TXT export preserves ordinary rows and escapes embedded tabs or line breaks", () => {
  expect(formatExportLine({ displayName: "bericht.txt", path: "/home/bericht.txt", sizeBytes: 42 }))
    .toBe("bericht.txt\t/home/bericht.txt\t42");
  const line = formatExportLine({
    displayName: "zeile\n2\tname.txt",
    path: "/tmp/zeile\n2\tname.txt",
    sizeBytes: 12,
  });
  expect(line).toBe("zeile\\n2\\tname.txt\t/tmp/zeile\\n2\\tname.txt\t12");
  expect(line.split("\t")).toHaveLength(3);
  expect(line).not.toMatch(/[\r\n\u0085\u2028\u2029]/u);
});

test("TXT export distinguishes literal backslashes from encoded controls", () => {
  const line = formatExportLine({
    displayName: "literal\\t und tab\t",
    path: "/tmp/literal\\n und newline\n",
    sizeBytes: 0,
  });
  expect(line).toBe("literal\\\\t und tab\\t\t/tmp/literal\\\\n und newline\\n\t0");
  expect(formatExportLine({ displayName: "a\u0085b\u2028c\u2029d\u0001e", path: "/tmp/ok", sizeBytes: 1 }))
    .toBe("a\\u0085b\\u2028c\\u2029d\\u0001e\t/tmp/ok\t1");
});

async function installSearchAdapter(
  page: import("@playwright/test").Page,
  options: { listenerFailure?: boolean; itemCount?: number; limitReached?: boolean; reportedResultCount?: number; kinds?: string[]; sizes?: number[]; modifiedTimes?: (number | null)[]; names?: string[]; extensions?: string[]; previewContent?: string; actionDelayMs?: number } = {},
) {
  await page.addInitScript((testOptions) => {
    const {
      listenerFailure = false,
      itemCount = 1,
      kinds = [],
      sizes = [],
      modifiedTimes = [],
      names = [],
      extensions = [],
      previewContent = "Beispieltext",
      limitReached = false,
      reportedResultCount = itemCount,
      actionDelayMs = 0,
    } = testOptions;
    const runtime = window as typeof window & {
      __lastSearchRequest?: unknown;
      __previewRequests?: number;
      __lastFileActionRequest?: unknown;
      __cancelledAction?: string;
      __fileActionProgress?: (payload: { sessionId: string; completed: number; total: number; bytesCompleted: number; bytesTotal: number; bytesPerSecond: number; phase: string }) => void;
      __searchListeners?: {
        onBatch(payload: unknown): void;
        onProgress(payload: unknown): void;
        onFinished(payload: unknown): void;
      };
    };

    window.__DATEIFINDER_TEST_ADAPTER__ = {
      async getPlatformCapabilities() {
        return {
          platform: "browser-test",
          canPickFolder: true,
          canOpenFile: false,
          canRevealFile: false,
          canSearchRecursively: true,
          supportsPickedFiles: false,
        };
      },
      async pickDirectory() {
        return { path: "/test/Dokumente", pathKey: "test-root" };
      },
      async previewText() {
        runtime.__previewRequests = (runtime.__previewRequests ?? 0) + 1;
        return previewContent;
      },
      async listenSearchEvents(listeners) {
        if (listenerFailure) throw new Error("listener registration failed");
        runtime.__searchListeners = listeners;
        return [];
      },
      async startSearch(request) {
        runtime.__lastSearchRequest = request;
        const items = Array.from({ length: itemCount }, (_, index) => ({
          id: `invoice-${index}`,
          displayName: names[index] ?? (index === 0 ? "rechnung-2025.pdf" : `rechnung-2025-${index}.pdf`),
          path: index === 0
            ? "/test/Dokumente/rechnung-2025.pdf"
            : `/test/Dokumente/rechnung-2025-${index}.pdf`,
          pathKey: `invoice-key-${index}`,
          extension: extensions[index] ?? "pdf",
          sizeBytes: sizes[index] ?? 2048 + index,
          modifiedAt: modifiedTimes[index] === undefined ? 1_735_689_600_000 + index : modifiedTimes[index],
          kind: kinds[index] ?? "document",
        }));
        runtime.__searchListeners?.onBatch({
          sessionId: request.sessionId,
          scannedCount: itemCount,
          items,
        });
        runtime.__searchListeners?.onProgress({ sessionId: request.sessionId, scannedCount: itemCount });
        await new Promise((resolve) => setTimeout(resolve, 500));
        runtime.__searchListeners?.onFinished({
          sessionId: request.sessionId,
          scannedCount: itemCount,
          resultCount: reportedResultCount,
          skippedCount: 0,
          durationMs: 4,
          limitReached,
        });
      },
      async cancelSearch() {},
      async listenFileActionProgress(callback) {
        runtime.__fileActionProgress = callback;
        return () => {};
      },
      async executeFileAction(request) {
        runtime.__lastFileActionRequest = request;
        const phase = request.action === "zip" ? "ZIP: Dateien vorbereitet"
          : request.action === "move" ? "Datei wird verschoben" : "Datei wird kopiert";
        runtime.__fileActionProgress?.({ sessionId: request.sessionId, completed: 0, total: request.pathKeys.length, bytesCompleted: 512, bytesTotal: 2048, bytesPerSecond: 1024, phase });
        if (actionDelayMs) await new Promise((resolve) => setTimeout(resolve, actionDelayMs));
        if (runtime.__cancelledAction === request.sessionId) throw new Error("Dateiaktion wurde abgebrochen.");
        runtime.__fileActionProgress?.({ sessionId: request.sessionId, completed: request.pathKeys.length, total: request.pathKeys.length, bytesCompleted: 2048, bytesTotal: 2048, bytesPerSecond: 2048, phase: request.action === "zip" ? "ZIP: Archiv wird geprüft" : "Dateien geprüft" });
        return { completed: request.pathKeys.length, destination: "/test/Ziel" };
      },
      async cancelFileAction(sessionId) { runtime.__cancelledAction = sessionId; },
    };
  }, options);
}

test("interactive search uses the injected platform contract and handles events", async ({ page }) => {
  await installSearchAdapter(page);
  await page.goto("/");

  await page.locator("#choose-source-nav").click();
  await expect(page.locator("#source-label")).toHaveText("Dokumente");
  await page.locator("#query-input").fill("rechnung 2025");
  await page.locator("#search-button").click();

  await expect(page.locator("#status-progress")).toBeVisible();
  await expect(page.locator("#status-detail")).toHaveText("1 geprüft · 1 Treffer");
  await expect(page.locator(".result-row")).toHaveCount(1);
  await expect(page.locator(".result-row")).toContainText("rechnung-2025.pdf");
  await expect(page.locator("#status-title")).toHaveText("1 Datei gefunden");
  await expect(page.locator("#status-detail")).toContainText("4 ms");
  await expect(page.locator("#status-progress")).toBeHidden();
  await expect(page.locator("#status-announcer")).toHaveText("1 Datei gefunden. 1 geprüft · 4 ms");
  await expect(page.locator("#cancel-search")).toBeDisabled();
});

test("result dates show the Unix epoch and reject invalid timestamps without crashing", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installSearchAdapter(page, {
    itemCount: 4,
    names: ["a-epoch.txt", "b-invalid.txt", "c-missing.txt", "d-ordinary.txt"],
    modifiedTimes: [0, 9e15, null, Date.UTC(2026, 9, 28)],
  });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("test");
  await page.locator("#search-button").click();
  await expect(page.locator("#status-title")).toHaveText("4 Dateien gefunden");
  const expectedDates = await page.evaluate(() => [
    new Intl.DateTimeFormat("de-DE").format(new Date(0)),
    "–",
    "–",
    new Intl.DateTimeFormat("de-DE").format(new Date(Date.UTC(2026, 9, 28))),
  ]);
  await expect(page.locator(".file-date")).toHaveText(expectedDates);
  expect(pageErrors).toEqual([]);
});

test("result selection keeps keyboard focus and exposes a concise selection summary", async ({ page }) => {
  await installSearchAdapter(page);
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();

  const row = page.locator(".result-row").first();
  await expect(row).toBeVisible();
  await row.focus();
  await row.click();

  await expect(row).toBeFocused();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#selection-summary")).toHaveText("1 Datei ausgewählt.");
  await expect(page.locator(".row-check")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".file-icon")).toHaveAttribute("aria-hidden", "true");
});

for (const action of ["copy", "move", "zip"] as const) {
  test(`${action} offers a safe target-dialog workflow with lossless path keys`, async ({ page }) => {
    await installSearchAdapter(page);
    await page.goto("/");
    await expect(page.locator("#file-action-toolbar")).toBeHidden();
    await page.locator("#choose-source-nav").click();
    await page.locator("#query-input").fill("rechnung");
    await page.locator("#search-button").click();
    await expect(page.locator("#status-title")).toHaveText("1 Datei gefunden");
    await page.locator(".result-row").click();
    await expect(page.locator("#file-action-toolbar")).toBeVisible();
    await page.locator(`#action-${action}`).click();
    await expect(page.locator("#file-action-dialog")).toBeVisible();
    await page.locator("#file-action-create-folder").check();
    await page.locator("#file-action-folder-name").fill("Archiv 2026");
    if (action === "zip") {
      await page.locator("#file-action-archive-name").fill("auswahl.zip");
    }
    await page.locator("#file-action-start").click();
    await expect(page.locator("#file-action-feedback")).toContainText("erfolgreich geprüft und gespeichert");
    const request = await page.evaluate(() => (window as typeof window & {
      __lastFileActionRequest?: Record<string, unknown>;
    }).__lastFileActionRequest);
    expect(request).toMatchObject({
      action,
      rootPathKey: "test-root",
      pathKeys: ["invoice-key-0"],
      newFolderName: "Archiv 2026",
      archiveName: action === "zip" ? "auswahl.zip" : null,
    });
    await expect(page.locator("#file-action-cancel")).toHaveText("Schließen");
    if (action === "move") await expect(page.locator(".result-row")).toHaveCount(0);
  });
}

test("in-progress file operation can be cancelled without closing the safety dialog", async ({ page }) => {
  await installSearchAdapter(page, { actionDelayMs: 500 });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();
  await expect(page.locator("#status-title")).toHaveText("1 Datei gefunden");
  await page.locator(".result-row").click();
  await page.locator("#action-copy").click();
  await page.locator("#file-action-start").click();
  await expect(page.locator("#file-action-cancel")).toHaveText("■ Abbrechen");
  await expect(page.locator("#file-action-progress")).toHaveAttribute("aria-valuenow", "25");
  await expect(page.locator("#file-action-byte-detail")).toContainText("512 B von 2 KB");
  await expect(page.locator("#file-action-byte-detail")).toContainText("Ø 1 KB/s");
  await page.locator("#file-action-cancel").click();
  await expect(page.locator("#file-action-dialog")).toBeVisible();
  await expect(page.locator("#file-action-feedback")).toContainText("abgebrochen");
  const cancelledId = await page.evaluate(() => (window as typeof window & { __cancelledAction?: string }).__cancelledAction);
  expect(cancelledId).toMatch(/[0-9a-f-]{36}/);
});

test("large result sets render only the visible virtual window", async ({ page }) => {
  await installSearchAdapter(page, { itemCount: 5_000 });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();

  await expect(page.locator("#result-count")).toContainText("5000");
  await expect(page.locator(".results-virtual-canvas")).toBeVisible();
  expect(await page.locator(".result-row").count()).toBeLessThan(40);

  await page.locator("#results-list").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(async () => page.locator(".result-row").count()).toBeLessThan(40);
  await expect(page.locator(".result-row").last()).toHaveAttribute("aria-label", /Treffer 5000 von 5000$/);
  await expect(page.locator("#metric-scanned")).toHaveText("5.000");
  await expect(page.locator("#metric-found")).toHaveText("5.000");
  const dimensions = await page.locator("#results-list").evaluate((node) => ({
    viewport: node.clientHeight,
    total: node.scrollHeight,
  }));
  expect(dimensions.viewport).toBeGreaterThan(0);
  expect(dimensions.total).toBeGreaterThan(dimensions.viewport);
});

test("file kinds have subtle distinct row colors in all four themes", async ({ page }) => {
  await installSearchAdapter(page, { itemCount: 4, kinds: ["image", "document", "audio", "text"] });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();
  await expect(page.locator(".result-row")).toHaveCount(4);

  for (const theme of themes) {
    await page.locator("#theme-select").selectOption(theme);
    const values = await page.locator(".result-row").evaluateAll((rows) => rows.map((row) => ({
      kind: (row as HTMLElement).dataset.kind,
      tint: getComputedStyle(row).getPropertyValue("--file-kind-rgb").trim(),
      background: getComputedStyle(row).backgroundImage,
    })));
    expect(new Set(values.map((value) => value.kind))).toEqual(new Set(["image", "document", "audio", "text"]));
    expect(new Set(values.map((value) => value.tint)).size).toBe(4);
    expect(values.every((value) => value.background.includes("linear-gradient"))).toBe(true);
  }
});

test("large-screen finding graphic shows live colored counts for type, year and size", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installSearchAdapter(page, {
    itemCount: 6,
    kinds: ["image", "image", "document", "audio", "text", "document"],
    sizes: [0, 250, 1024 * 1024, 3 * 1024 * 1024, 50 * 1024 * 1024, 1024 * 1024 * 1024],
    modifiedTimes: [Date.UTC(2026, 1, 1), Date.UTC(2026, 1, 1), Date.UTC(2025, 1, 1), null, Date.UTC(2024, 1, 1), Date.UTC(2025, 1, 1)],
  });
  await page.goto("/");
  await expect(page.locator("#insights-toggle")).toBeHidden();
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();

  await expect(page.locator("#insights-panel")).toBeVisible();
  await expect(page.locator("#insights-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#insights-total")).toContainText("Zwischenstand: 6");
  await expect(page.locator("#status-title")).toHaveText("6 Dateien gefunden");
  await expect(page.locator("#insights-total")).toContainText("Angezeigt: 6");
  await expect(page.locator("#insights-legend li")).toHaveCount(4);
  await expect(page.locator("#insights-legend")).toContainText("Bilder 2");
  await expect(page.locator("#insights-legend")).toContainText("Dokumente 2");
  await expect(page.locator("#insights-legend")).toContainText("Audio 1");
  await expect(page.locator("#insights-legend")).toContainText("Sonstige 1");
  const colors = await page.locator(".insights-chart-segment").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
  expect(new Set(colors).size).toBe(4);

  await page.locator("#insights-mode").selectOption("year");
  await expect(page.locator("#insights-legend")).toContainText("2026 2");
  await expect(page.locator("#insights-legend")).toContainText("2025 2");
  await expect(page.locator("#insights-legend")).toContainText("2024 1");
  await expect(page.locator("#insights-legend")).toContainText("Ohne Datum 1");

  await page.locator("#insights-mode").selectOption("size");
  await expect(page.locator("#insights-legend")).toContainText("0 Byte 1");
  await expect(page.locator("#insights-legend")).toContainText("Unter 1 MB 1");
  await expect(page.locator("#insights-legend")).toContainText("1–10 MB 2");
  await expect(page.locator("#insights-legend")).toContainText("10–100 MB 1");
  await expect(page.locator("#insights-legend")).toContainText("Ab 1 GB 1");
  const chartDescription = await page.locator("#insights-chart").getAttribute("aria-label");
  expect(chartDescription).toContain("6 angezeigte Treffer");
});

test("optional text-content search is explicit and preview renders harmless text", async ({ page }) => {
  await installSearchAdapter(page, { itemCount: 1, kinds: ["text"], names: ["gedanken.txt"], extensions: ["txt"], previewContent: "Hallo aus der Textdatei\n<script>harmlos</script>" });
  await page.goto("/");
  await page.locator("#settings-button").click();
  await page.locator("#settings-content-search").check();
  await page.keyboard.press("Escape");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("hallo");
  await page.locator("#search-button").click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __lastSearchRequest?: { searchContents: boolean } }).__lastSearchRequest?.searchContents)).toBe(true);
  await page.locator(".result-row").click();
  await expect(page.locator("#text-preview")).toBeVisible();
  await expect(page.locator("#text-preview")).toContainText("Hallo aus der Textdatei");
  await expect(page.locator("#text-preview")).toContainText("<script>harmlos</script>");
  await expect(page.locator("#preview-visual")).toBeHidden();
  expect(await page.locator("#text-preview script").count()).toBe(0);
});

test("compact finding graphic is optional and never changes list scroll height", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 420 });
  await installSearchAdapter(page, { itemCount: 500 });
  await page.goto("/");
  await page.locator("#mobile-source-button").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();
  await expect(page.locator("#insights-toggle")).toBeVisible();
  await expect(page.locator("#insights-panel")).toBeHidden();
  const before = await page.locator("#results-list").evaluate((node) => node.clientHeight);
  await page.locator("#insights-toggle").click();
  await expect(page.locator("#insights-panel")).toBeVisible();
  const after = await page.locator("#results-list").evaluate((node) => node.clientHeight);
  expect(after).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.locator("#insights-mode").selectOption("year");
  await expect(page.locator("#insights-legend")).toContainText("2025");
  await page.locator("#insights-toggle").click();
  await expect(page.locator("#insights-panel")).toBeHidden();
  expect(await page.locator("#results-list").evaluate((node) => node.clientHeight)).toBe(before);
});

test("empty state reflects the chosen folder and offers a helpful next action", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installSearchAdapter(page, { itemCount: 0 });
  await page.goto("/");
  await expect(page.locator("#empty-title")).toHaveText("Noch kein Suchort gewählt.");
  await page.locator("#empty-action").click();
  await expect(page.locator("#source-label")).toHaveText("Dokumente");
  await expect(page.locator("#empty-title")).toHaveText("Suchort bereit: Dokumente");
  await page.locator("#empty-action").click();
  await expect(page.locator("#query-input")).toBeFocused();
  await page.locator("#query-input").fill("ein-nicht-vorhandener-begriff");
  await page.locator("#search-button").click();
  await expect(page.locator("#status-title")).toHaveText("0 Dateien gefunden");
  await expect(page.locator("#empty-title")).toHaveText("Keine passenden Dateien gefunden.");
  await expect(page.locator("#empty-detail")).toContainText("Dateitypfilter");
});

test("changing the folder resets stale results and visual preview details", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installSearchAdapter(page, { kinds: ["image"] });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();
  await expect(page.locator(".result-row")).toHaveCount(1);
  await page.locator(".result-row").click();
  await expect(page.locator("#preview-visual")).toHaveAttribute("data-kind", "image");
  await expect(page.locator("#preview-visual")).toHaveAttribute("data-caption", "Bilder");
  await expect(page.locator("#preview-summary")).toContainText("Bilder");
  await expect(page.locator("#status-title")).toHaveText("1 Datei gefunden");
  await page.locator("#choose-source-nav").click();
  await expect(page.locator(".result-row")).toHaveCount(0);
  await expect(page.locator("#empty-title")).toContainText("Suchort bereit");
  await expect(page.locator("#preview-visual")).toHaveAttribute("data-kind", "empty");
});

test("large desktop layouts scale navigation, typography and preview without overflowing", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    for (const theme of themes) {
      await page.locator("#theme-select").selectOption(theme);
      const geometry = await page.evaluate(() => {
        const sidebar = document.querySelector<HTMLElement>(".sidebar")!;
        const preview = document.querySelector<HTMLElement>(".preview-panel")!;
        const title = document.querySelector<HTMLElement>(".topbar h1")!;
        const search = document.querySelector<HTMLElement>("#query-input")!;
        const emptyButton = document.querySelector<HTMLElement>("#empty-action")!;
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          sidebar: sidebar.getBoundingClientRect().width,
          preview: preview.getBoundingClientRect().width,
          titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
          searchFont: Number.parseFloat(getComputedStyle(search).fontSize),
          emptyButtonVisible: emptyButton.getBoundingClientRect().width > 0,
        };
      });
      expect(geometry.overflow, `${viewport.width}px, ${theme}`).toBeLessThanOrEqual(0);
      expect(geometry.sidebar).toBeGreaterThanOrEqual(185);
      expect(geometry.preview).toBeGreaterThanOrEqual(315);
      expect(geometry.titleFont).toBeGreaterThanOrEqual(27);
      expect(geometry.searchFont).toBeGreaterThanOrEqual(14);
      expect(geometry.emptyButtonVisible).toBe(true);
    }
  }
});

test("file types and any-word matching are forwarded before the scan", async ({ page }) => {
  await installSearchAdapter(page);
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("urlaub 2025 fotos");
  await page.locator('[data-file-type="image"]').click();
  await page.locator('[data-file-type="audio"]').click();
  await page.locator("#match-mode-select").selectOption("any");
  await page.locator("#search-button").click();

  const request = await page.evaluate(() => (window as typeof window & { __lastSearchRequest?: unknown }).__lastSearchRequest);
  expect(request).toMatchObject({
    query: "urlaub 2025 fotos",
    matchMode: "any",
    fileTypes: ["image", "audio"],
    maxResults: 20_000,
  });
  await expect(page.locator("#metric-filter")).toHaveText("Bilder, Audio");
});

test("header settings open and search preferences can be adjusted", async ({ page }) => {
  await page.goto("/");
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await expect(page.locator("#settings-zoom")).toHaveValue("1");
  await page.locator("#settings-match-select").selectOption("any");
  await expect(page.locator("#match-mode-select")).toHaveValue("any");
  await page.locator("#settings-theme-select").selectOption("green");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "green");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-dialog")).toBeHidden();
  await expect(page.locator("#settings-button")).toBeFocused();
});

test("a smaller window scrolls results internally without horizontal growth", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 420 });
  await installSearchAdapter(page, { itemCount: 5_000 });
  await page.goto("/");
  await page.locator("#mobile-source-button").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();
  await expect(page.locator("#result-count")).toContainText("5000");

  const size = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>("#results-list")!;
    const panel = document.querySelector<HTMLElement>(".results-panel")!;
    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelHeight: panel.getBoundingClientRect().height,
      listHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
    };
  });
  expect(size.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(size.panelHeight).toBeLessThanOrEqual(500);
  expect(size.scrollHeight).toBeGreaterThan(size.listHeight);
});

test("result limit is clearly reported as incomplete", async ({ page }) => {
  await installSearchAdapter(page, { itemCount: 10, limitReached: true, reportedResultCount: 20_000 });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();

  await expect(page.locator("#result-limit-notice")).toBeVisible();
  await expect(page.locator("#result-limit-notice")).toContainText("Weitere passende Dateien können vorhanden sein");
  await expect(page.locator("#result-limit-notice")).toContainText("Export sind unvollständig");
  await expect(page.locator("#status-title")).toHaveText("Treffergrenze erreicht");
  await expect(page.locator(".status-block")).toHaveAttribute("data-tone", "warning");
  await expect(page.locator("#export-results")).toHaveAttribute("title", /unvollständig/);
});

test("listener failure reports an error without disabling DOM interactions", async ({ page }) => {
  await installSearchAdapter(page, { listenerFailure: true });
  await page.goto("/");

  await expect(page.locator("#status-title")).toHaveText("Suchereignisse nicht verfügbar");
  await page.locator('[data-query-chip="rechnung"]').click();
  await expect(page.locator("#query-input")).toHaveValue("rechnung");
  await page.locator("#search-help-button").click();
  await expect(page.locator("#search-help-dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator("#choose-source-nav").click();
  await page.locator("#search-button").click();
  await expect(page.locator("#status-title")).toHaveText("Suche nicht verfügbar");
  await expect(page.locator(".status-block")).toHaveAttribute("data-tone", "error");
  await expect(page.locator("#status-progress")).toBeHidden();
  await expect(page.locator("#cancel-search")).toBeDisabled();
});

test("reference shell stays inside 768x512", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".app-shell");
  await expect(shell).toBeVisible();
  const box = await shell.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(768);
  expect(box!.y + box!.height).toBeLessThanOrEqual(512);
});

test("brand stays inside the sidebar without colliding with the workspace", async ({ page }) => {
  await page.goto("/");
  const brand = page.locator(".brand");
  const sidebar = page.locator(".sidebar");
  const workspace = page.locator(".workspace");

  const [brandBox, sidebarBox, workspaceBox] = await Promise.all([
    brand.boundingBox(),
    sidebar.boundingBox(),
    workspace.boundingBox(),
  ]);
  expect(brandBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(workspaceBox!.x);

  const brandTitle = page.locator(".brand strong");
  const titleBox = await brandTitle.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  expect(await brandTitle.evaluate((node) => {
    const style = getComputedStyle(node);
    return { overflow: style.overflow, textOverflow: style.textOverflow };
  })).toEqual({ overflow: "hidden", textOverflow: "ellipsis" });
});

for (const theme of themes) {
  test(`theme ${theme} keeps identical shell geometry`, async ({ page }) => {
    await page.goto("/");
    await page.locator("body").evaluate((body, value) => {
      body.setAttribute("data-theme", String(value));
    }, theme);
    const shell = page.locator(".app-shell");
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(768);
    expect(Math.round(box!.height)).toBe(512);
    const accent = await page.locator("body").evaluate((body) => getComputedStyle(body).getPropertyValue("--accent").trim());
    expect(accent.length).toBeGreaterThan(0);
  });
}

test("200-percent zoom equivalent keeps critical controls reachable", async ({ page }) => {
  // A 768x512 native window at 200% browser/WebView zoom exposes roughly a
  // 384x256 logical CSS viewport. Modelling that viewport exercises the same
  // responsive breakpoints without the artificial 100vw expansion caused by
  // CSS `zoom`.
  await page.setViewportSize({ width: 384, height: 256 });
  await page.goto("/");

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);

  for (const selector of ["#query-input", "#search-button", "#theme-select", ".actionbar"]) {
    const control = page.locator(selector);
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box, `${selector} missing`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(384);
    expect(box!.y + box!.height).toBeLessThanOrEqual(256);
  }
});

test("keyboard focus targets remain present and labelled", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#query-input")).toHaveAttribute("aria-label", "Dateinamen suchen");
  await expect(page.locator("#query-input")).toHaveAttribute("aria-describedby", "query-help");
  await expect(page.locator("#sort-select")).toHaveAttribute("aria-label", "Sortierung");
  await expect(page.locator("#theme-select")).toHaveAttribute("aria-label", "Farbschema");
  await expect(page.locator("#cancel-search")).toHaveAttribute("aria-label", "Suche abbrechen");
  await expect(page.locator("#window-close")).toHaveAttribute("aria-label", "Fenster schließen");
  await expect(page.locator(".status-block")).not.toHaveAttribute("role", "status");
  await expect(page.locator("#status-announcer")).toHaveAttribute("role", "status");
  await expect(page.locator("#status-announcer")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#status-progress")).toHaveAttribute("role", "progressbar");
  await expect(page.locator("#status-progress")).toHaveAttribute("aria-label", "Suchfortschritt");
  await expect(page.locator("#result-count")).not.toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#results-list")).toHaveAttribute("role", "group");
  await expect(page.locator("#results-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#selection-summary")).toHaveAttribute("aria-live", "polite");
});

test("hidden empty state does not override native hidden semantics", async ({ page }) => {
  await page.goto("/");
  const emptyState = page.locator("#empty-state");
  await emptyState.evaluate((node) => node.setAttribute("hidden", ""));
  await expect(emptyState).toBeHidden();
});

test("search help explains the existing matcher in plain language", async ({ page }) => {
  await page.goto("/");
  const helpButton = page.locator("#search-help-button");
  const dialog = page.locator("#search-help-dialog");
  await helpButton.focus();
  await dialog.evaluate((node: HTMLDialogElement) => node.showModal());
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("In drei Schritten");
  await expect(dialog).toContainText("mindestens einem");
  await expect(dialog).toContainText("Groß- und Kleinschreibung spielen keine Rolle");
  await expect(dialog.locator(".help-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(helpButton).toBeFocused();
});

test("non-text selection clears cached text preview and reloads on return", async ({ page }) => {
  await installSearchAdapter(page, {
    itemCount: 2,
    kinds: ["text", "image"],
    names: ["a-notiz.txt", "z-bild.png"],
    extensions: ["txt", "png"],
  });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("notiz");
  await page.locator("#search-button").click();
  await expect(page.locator("#status-title")).toHaveText("2 Dateien gefunden");

  const rows = page.locator(".result-row");
  await expect(rows).toHaveCount(2);
  await rows.nth(0).click();
  await expect(page.locator("#text-preview")).toContainText("Beispieltext");
  const previewRequests = () => page.evaluate(() =>
    (window as typeof window & { __previewRequests?: number }).__previewRequests ?? 0);
  await expect.poll(previewRequests).toBe(1);

  await rows.nth(1).click();
  await expect(page.locator("#text-preview")).toBeHidden();
  await expect(page.locator("#text-preview")).toBeEmpty();

  await rows.nth(0).click();
  await expect.poll(previewRequests).toBe(2);
  await expect(page.locator("#text-preview")).toContainText("Beispieltext");
});
