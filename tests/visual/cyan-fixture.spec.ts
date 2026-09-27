import { expect, test } from "@playwright/test";

test("cyan fixture renders stable 768x512 reference", async ({ page }) => {
  expect(page.viewportSize()).toEqual({ width: 768, height: 512 });

  await page.goto("/tests/visual/cyan-fixture.html");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toHaveAttribute("data-visual-fixture", "cyan-v1");
  await expect(page.locator('script[src*="src/main.ts"]')).toHaveCount(0);
  await expect(page.locator(".result-row")).toHaveCount(5);
  await expect(page.locator(".result-row").first()).toContainText("Urlaub_2025_Berlin.jpg");
  await expect(page.locator("#preview-name")).toHaveText("Urlaub_2025_Berlin.jpg");

  await expect(page).toHaveScreenshot("cyan-fixture-768x512.png", {
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
});
