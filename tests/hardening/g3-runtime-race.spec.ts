import { test, expect } from "@playwright/test";

type G3Control = {
  started: string[];
  cancelled: string[];
  emit(event: string, payload: unknown): void;
};

declare global {
  interface Window { __G3: G3Control; }
}

const entry = (id: string, name: string) => ({
  id,
  displayName: name,
  path: `/tmp/g3-root/${name}`,
  extension: "txt",
  sizeBytes: 10,
  modifiedAt: 1_700_000_000_000,
  kind: "document",
});

test("G3 runtime: late events from cancelled session A cannot mutate replacement session B", async ({ page }) => {
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await expect(page.locator("#source-label")).toHaveText("g3-root");

  await page.locator("#query-input").fill("alpha");
  await page.locator("#search-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => window.__G3.started.length)).toBe(1);
  const sessionA = await page.evaluate(() => window.__G3.started[0]);

  await page.locator("#query-input").fill("beta");
  await page.locator("#search-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => window.__G3.started.length)).toBe(2);
  const sessionB = await page.evaluate(() => window.__G3.started[1]);
  expect(sessionB).not.toBe(sessionA);
  await expect.poll(() => page.evaluate(() => window.__G3.cancelled)).toContain(sessionA);

  await page.evaluate(({ sessionB, item }) => {
    window.__G3.emit("search-batch", { sessionId: sessionB, items: [item], scannedCount: 1 });
    window.__G3.emit("search-progress", { sessionId: sessionB, scannedCount: 1 });
  }, { sessionB, item: entry("b", "beta.txt") });
  await expect(page.locator("#result-count")).toContainText("1 Datei");
  await expect(page.locator("#results-list")).toContainText("beta.txt");

  await page.evaluate(({ sessionA, item }) => {
    window.__G3.emit("search-batch", { sessionId: sessionA, items: [item], scannedCount: 999 });
    window.__G3.emit("search-progress", { sessionId: sessionA, scannedCount: 999 });
    window.__G3.emit("search-cancelled", { sessionId: sessionA });
    window.__G3.emit("search-finished", { sessionId: sessionA, scannedCount: 999, resultCount: 999, skippedCount: 0, durationMs: 1 });
  }, { sessionA, item: entry("a", "stale-alpha.txt") });

  await expect(page.locator("#results-list")).toContainText("beta.txt");
  await expect(page.locator("#results-list")).not.toContainText("stale-alpha.txt");
  await expect(page.locator("#result-count")).toContainText("1 Datei");
  await expect(page.locator("#cancel-search")).toBeEnabled();

  await page.evaluate((sessionB) => {
    window.__G3.emit("search-finished", { sessionId: sessionB, scannedCount: 1, resultCount: 1, skippedCount: 0, durationMs: 5 });
  }, sessionB);
  await expect(page.locator("#cancel-search")).toBeDisabled();
});
