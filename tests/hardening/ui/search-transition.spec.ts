import { expect, test } from "@playwright/test";

test("two submissions during a pending cancellation start only one replacement search", async ({ page }) => {
  await page.addInitScript(() => {
    const runtime = window as typeof window & {
      __searchRace?: {
        starts: string[];
        cancels: string[];
        ready: boolean;
        releaseCancel?: () => void;
      };
    };
    const race = { starts: [] as string[], cancels: [] as string[], ready: false, releaseCancel: undefined as (() => void) | undefined };
    runtime.__searchRace = race;
    window.__DATEIFINDER_TEST_ADAPTER__ = {
      async getPlatformCapabilities() {
        return {
          platform: "browser-test", canPickFolder: true, canOpenFile: false,
          canRevealFile: false, canSearchRecursively: true, supportsPickedFiles: false,
        };
      },
      async pickDirectory() { return { path: "/test/Dokumente", pathKey: "test-root" }; },
      async listenSearchEvents() { race.ready = true; return []; },
      async startSearch(request) { race.starts.push(request.sessionId); },
      async cancelSearch(sessionId) {
        race.cancels.push(sessionId);
        await new Promise<void>((resolve) => { race.releaseCancel = resolve; });
      },
    };
  });

  await page.goto("/");
  await page.waitForFunction(() => (window as typeof window & { __searchRace?: { ready: boolean } }).__searchRace?.ready);
  await page.locator("#choose-source-nav").click();
  await page.locator("#query-input").fill("rechnung");
  await page.locator("#search-button").click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __searchRace?: { starts: string[] } }).__searchRace?.starts.length)).toBe(1);

  await page.evaluate(() => {
    const form = document.getElementById("search-form") as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __searchRace?: { cancels: string[] } }).__searchRace?.cancels.length)).toBe(1);
  await page.evaluate(() => (window as typeof window & { __searchRace?: { releaseCancel?: () => void } }).__searchRace?.releaseCancel?.());
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __searchRace?: { starts: string[] } }).__searchRace?.starts.length)).toBe(2);
  expect(await page.evaluate(() => (window as typeof window & { __searchRace?: { cancels: string[] } }).__searchRace?.cancels.length)).toBe(1);
});
