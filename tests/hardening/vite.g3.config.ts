import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const mock = fileURLToPath(new URL("./g3-tauri-mock.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@tauri-apps/api/core", replacement: mock },
      { find: "@tauri-apps/api/event", replacement: mock },
      { find: "@tauri-apps/api/window", replacement: mock },
      { find: "@tauri-apps/plugin-dialog", replacement: mock },
      { find: "@tauri-apps/plugin-store", replacement: mock },
    ],
  },
  server: { host: "127.0.0.1", port: 1421, strictPort: true },
});
