import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pttzzz/core/internal": fileURLToPath(new URL("../core/src/internal.ts", import.meta.url)),
      "@pttzzz/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: [fileURLToPath(new URL("./src/testSetup.ts", import.meta.url))],
  },
});
