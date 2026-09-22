import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { fileURLToPath, URL } from 'node:url'
import { resolvePttViteConfig } from '../../dev/vitePtt'

export default defineConfig(({ command, mode, isPreview }) => {
  const envDir = fileURLToPath(new URL('../..', import.meta.url))
  const ptt = resolvePttViteConfig({ command, mode, isPreview: isPreview ?? false, envDir })
  return {
    envDir,
    define: ptt.define,
    resolve: {
      alias: [
        { find: /^@pttzzz\/browser\/testing$/, replacement: fileURLToPath(new URL('../../packages/browser/src/testing.ts', import.meta.url)) },
        { find: /^@pttzzz\/browser$/, replacement: fileURLToPath(new URL('../../packages/browser/src/index.ts', import.meta.url)) },
        { find: /^@pttzzz\/core$/, replacement: fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) },
      ],
    },
    plugins: [
      nodePolyfills({ globals: { Buffer: true, global: true, process: true }, protocolImports: true }),
      react(),
      tailwindcss(),
      ptt.plugin,
    ],
    test: {
      environment: 'node',
      setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    },
  }
})
