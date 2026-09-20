import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { fileURLToPath, URL } from 'node:url'
import { resolvePttTarget, type PttTarget } from './dev/pttTarget'
import { attachPttProxy } from './dev/pttProxy'

function pttWsPlugin(target: PttTarget): Plugin {
  let dispose: (() => void) | undefined
  return {
    name: 'ptt-ws-proxy',
    configureServer(server) {
      // Vitest uses Vite in middleware mode without a listening server.
      if (!server.httpServer) return
      dispose = attachPttProxy(server.httpServer, target)
      server.config.logger.info(target.kind === 'local'
        ? `[PTT] local tcp://${target.host}:${target.port}`
        : '[PTT] LIVE wss://ws.ptt.cc/bbs')
    },
    closeBundle() { dispose?.() },
  }
}

export default defineConfig(({ command, mode, isPreview }) => {
  const envDir = fileURLToPath(new URL('../..', import.meta.url))
  if ((command === 'build' || isPreview) && mode === 'ptt-local') {
    throw new Error('local PTT is development-only; use npm run dev:local')
  }
  if (command === 'serve' && !isPreview && process.env.NODE_ENV === 'production') {
    throw new Error('PTT development server requires development NODE_ENV')
  }
  const target = command === 'serve' && !isPreview
    ? resolvePttTarget(mode, loadEnv(mode, envDir, 'PTT_'))
    : resolvePttTarget('ptt-live', {})
  const label = target.kind === 'local' ? `本機 PTT（${target.host}:${target.port}）` : '正式 PTT（ws.ptt.cc）'
  return {
    envDir,
    define: { 'import.meta.env.VITE_PTT_CONNECTION_LABEL': JSON.stringify(label) },
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
      pttWsPlugin(target),
    ],
    test: {
      environment: 'node',
      setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    },
  }
})
