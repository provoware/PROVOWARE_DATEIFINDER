import { expect, test } from "@playwright/test";

const themes = ["cyan", "purple", "green", "orange"] as const;

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
  await expect(page.locator("#sort-select")).toHaveAttribute("aria-label", "Sortierung");
  await expect(page.locator("#theme-select")).toHaveAttribute("aria-label", "Farbschema");
  await expect(page.locator("#window-close")).toHaveAttribute("aria-label", "Fenster schließen");
});
