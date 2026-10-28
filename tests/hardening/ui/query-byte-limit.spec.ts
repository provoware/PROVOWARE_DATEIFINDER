import { expect, test } from "@playwright/test";
import { isSearchQueryWithinByteLimit } from "../../../src/search-query";

test("query limit counts UTF-8 bytes rather than UTF-16 code units", () => {
  expect(isSearchQueryWithinByteLimit("a".repeat(4096))).toBe(true);
  expect(isSearchQueryWithinByteLimit("a".repeat(4097))).toBe(false);
  expect(isSearchQueryWithinByteLimit("ä".repeat(2048))).toBe(true);
  expect(isSearchQueryWithinByteLimit("ä".repeat(2049))).toBe(false);
  expect(isSearchQueryWithinByteLimit("🧪".repeat(1024))).toBe(true);
  expect(isSearchQueryWithinByteLimit("🧪".repeat(1025))).toBe(false);
});

test("oversized UTF-8 query is rejected before invoking Rust", async ({ page }) => {
  await page.addInitScript(() => {
    const runtime = window as typeof window & { __lastSearchRequest?: unknown };
    window.__DATEIFINDER_TEST_ADAPTER__ = {
      async getPlatformCapabilities() {
        return {
          platform: "browser-test", canPickFolder: true, canOpenFile: false,
          canRevealFile: false, canSearchRecursively: true, supportsPickedFiles: false,
        };
      },
      async pickDirectory() { return { path: "/test/Dokumente", pathKey: "test-root" }; },
      async listenSearchEvents() { return []; },
      async startSearch(request) { runtime.__lastSearchRequest = request; },
    };
  });
  await page.goto("/");
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("ä".repeat(2049));
  await page.locator("#search-button").click();
  await expect(page.locator("#status-title")).toHaveText("Suchbegriff zu lang");
  await expect(page.locator("#status-detail")).toContainText("4.096 Byte");
  expect(await page.evaluate(() => (window as typeof window & { __lastSearchRequest?: unknown }).__lastSearchRequest)).toBeUndefined();

  await page.locator("#query-input").fill("ä".repeat(2048));
  await page.locator("#search-button").click();
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __lastSearchRequest?: unknown }).__lastSearchRequest))).toBe(true);
});
