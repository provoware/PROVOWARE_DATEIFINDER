import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const APPROVED_CYAN_FIXTURE_SHA256 = "cbc76211e6e5e06840232c65f06234561e9c4a5644a57bc1d85123691a3f6019";

test("cyan fixture renders stable 768x512 reference", async ({ page }, testInfo) => {
  expect(page.viewportSize()).toEqual({ width: 768, height: 512 });

  await page.goto("/tests/visual/cyan-fixture.html");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toHaveAttribute("data-visual-fixture", "cyan-v1");
  await expect(page.locator('script[src*="src/main.ts"]')).toHaveCount(0);
  await expect(page.locator(".result-row")).toHaveCount(5);
  await expect(page.locator(".result-row").first()).toContainText("Urlaub_2025_Berlin.jpg");
  await expect(page.locator("#preview-name")).toHaveText("Urlaub_2025_Berlin.jpg");

  const screenshot = await page.screenshot({
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
  const actualHash = createHash("sha256").update(screenshot).digest("hex");

  if (actualHash !== APPROVED_CYAN_FIXTURE_SHA256) {
    await writeFile(testInfo.outputPath("cyan-fixture-actual.png"), screenshot);
    await testInfo.attach("cyan-fixture-768x512-actual.png", {
      body: screenshot,
      contentType: "image/png",
    });
  }

  expect(actualHash).toBe(APPROVED_CYAN_FIXTURE_SHA256);
});
