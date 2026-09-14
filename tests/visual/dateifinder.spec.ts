import { expect, test } from "@playwright/test";

test("768x512 Golden Reference", async ({ page }) => {
  expect(page.viewportSize()).toEqual({ width: 768, height: 512 });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".app-shell")).toBeVisible();

  await expect(page).toHaveScreenshot("dateifinder-768x512.png", {
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
});
