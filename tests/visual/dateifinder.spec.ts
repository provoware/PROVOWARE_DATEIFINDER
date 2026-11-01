import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// Erneut begutachtete 768×512-Ansicht mit Schnellspeicher und Auswahlknopf (PR #75).
// Prüfbild: quality-Run 41256358484, visual-failure-evidence, 01.11.2026.
const APPROVED_768X512_SHA256 = "3b1d1a7df2092619e2050914e723aa66e786d3512c46e7557b640a0a54f6b135";

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
