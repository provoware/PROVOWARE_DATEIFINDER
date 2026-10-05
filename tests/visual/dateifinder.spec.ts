import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const APPROVED_768X512_SHA256 = "1081263ca2a48f2f4454a150c9d592b8df33a9a819ce4a93101cbad78d4f9356";

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
