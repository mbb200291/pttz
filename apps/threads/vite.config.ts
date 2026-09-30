import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { fileURLToPath } from 'node:url'
import { resolvePttViteConfig } from '../../dev/vitePtt'

export default defineConfig(({ command, mode, isPreview }) => {
  const envDir = fileURLToPath(new URL('../..', import.meta.url))
  const ptt = resolvePttViteConfig({ command, mode, isPreview: isPreview ?? false, envDir, defaultTarget: 'ptt' })
  return {
    envDir,
    define: ptt.define,
    plugins: mode === 'test' ? [] : [
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
      ptt.plugin,
    ],
  }
})
