import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolvePttViteConfig } from "../../dev/vitePtt";

export default defineConfig(({ command, mode, isPreview }) => {
  const envDir = fileURLToPath(new URL("../..", import.meta.url));
  const ptt = resolvePttViteConfig({ command, mode, isPreview: isPreview ?? false, envDir, defaultTarget: "ptt" });
  return {
    envDir,
    define: ptt.define,
    server: { port: 5183 },
    build: { target: "es2022" },
    plugins: [
      nodePolyfills({ globals: { Buffer: true, global: true, process: true }, protocolImports: true }),
      ptt.plugin,
    ],
  };
});
