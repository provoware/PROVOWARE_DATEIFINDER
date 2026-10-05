import { expect, test } from "@playwright/test";

const themes = ["cyan", "purple", "green", "orange"] as const;

async function installSearchAdapter(page: import("@playwright/test").Page, listenerFailure = false) {
  await page.addInitScript((failListeners) => {
    const runtime = window as typeof window & {
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
      async listenSearchEvents(listeners) {
        if (failListeners) throw new Error("listener registration failed");
        runtime.__searchListeners = listeners;
        return [];
      },
      async startSearch(request) {
        runtime.__searchListeners?.onBatch({
          sessionId: request.sessionId,
          scannedCount: 1,
          items: [{
            id: "invoice",
            displayName: "rechnung-2025.pdf",
            path: "/test/Dokumente/rechnung-2025.pdf",
            pathKey: "invoice-key",
            extension: "pdf",
            sizeBytes: 2048,
            modifiedAt: 1_735_689_600_000,
            kind: "document",
          }],
        });
        runtime.__searchListeners?.onProgress({ sessionId: request.sessionId, scannedCount: 1 });
        await new Promise((resolve) => setTimeout(resolve, 500));
        runtime.__searchListeners?.onFinished({
          sessionId: request.sessionId,
          scannedCount: 1,
          resultCount: 1,
          skippedCount: 0,
          durationMs: 4,
        });
      },
      async cancelSearch() {},
    };
  }, listenerFailure);
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

test("listener failure reports an error without disabling DOM interactions", async ({ page }) => {
  await installSearchAdapter(page, true);
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
  expect(await page.locator(".brand strong").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
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
  await expect(dialog).toContainText("muss jedes Wort im Dateinamen vorkommen");
  await expect(dialog).toContainText("Groß- und Kleinschreibung spielen keine Rolle");
  await expect(dialog.locator(".help-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(helpButton).toBeFocused();
});
