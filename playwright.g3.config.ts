import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/hardening",
  testMatch: "g3-runtime-race.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:1421",
    headless: true,
  },
  webServer: {
    command: "npx vite --config tests/hardening/vite.g3.config.ts",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
