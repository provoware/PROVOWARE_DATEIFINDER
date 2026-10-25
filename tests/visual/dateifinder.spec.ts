import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// Absichtlich neu begutachtete 768×512-Ansicht mit Suchfiltern und Prozessstatus (PR #43).
const APPROVED_768X512_SHA256 = "1a618247129cdc3248f02cffdead6713b23192bbe19ed27c3ab13c27e9c147fc";

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
    await writeFile(testInfo.outputPath("dateifinder-actual.png"), screenshot);
    await testInfo.attach("dateifinder-768x512-actual.png", {
      body: screenshot,
      contentType: "image/png",
    });
  }

  expect(actualHash).toBe(APPROVED_768X512_SHA256);
});
