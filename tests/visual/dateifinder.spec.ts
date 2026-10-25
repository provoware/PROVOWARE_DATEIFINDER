import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const APPROVED_768X512_SHA256 = "1d4e722121803ad4d25255b1b5782e385d4a61f70fee3c0455bc318ed654b57d";

test("768x512 Golden Reference", async ({ page }, testInfo) => {
  expect(page.viewportSize()).toEqual({ width: 768, height: 512 });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".app-shell")).toBeVisible();

  const screenshot = await page.screenshot({
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
  const actualHash = createHash("sha256").update(screenshot).digest("hex");

  if (actualHash !== APPROVED_768X512_SHA256) {
    await testInfo.attach("dateifinder-768x512-actual.png", {
      body: screenshot,
      contentType: "image/png",
    });
  }

  expect(actualHash).toBe(APPROVED_768X512_SHA256);
});
