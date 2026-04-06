import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { WebSocket as WsNode, WebSocketServer } from 'ws'
import type { Duplex } from 'stream'

/**
 * 在 Vite dev server 上攔截 /ptt-ws 的 WebSocket upgrade，
 * 建立一條到 wss://ws.ptt.cc/bbs 的連線並注入 Origin: https://term.ptt.cc。
 *
 * 為什麼不用 server.proxy：
 *   http-proxy 的 WS pass 建立 upgrade request 時不 merge options.headers，
 *   所以 Origin 無法被覆蓋，PTT server 會拒絕。
 */
function pttWsPlugin(): Plugin {
  return {
    name: 'ptt-ws-proxy',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true })

      server.httpServer?.on('upgrade', (req, socket: Duplex, head: Buffer) => {
        // 只處理 /ptt-ws，其餘留給 Vite HMR 自己處理
        if (!req.url?.startsWith('/ptt-ws')) return

        wss.handleUpgrade(req, socket, head, (browserWs) => {
          const pttWs = new WsNode('wss://ws.ptt.cc/bbs', {
            headers: { Origin: 'https://term.ptt.cc' },
          })

          pttWs.once('open', () => {
            // browser → PTT
            browserWs.on('message', (msg) => {
              if (pttWs.readyState === WsNode.OPEN) pttWs.send(msg)
            })
            // PTT → browser（保留 binary 旗標，PTT 送的是 Big5 binary frame）
            pttWs.on('message', (msg, isBinary) => {
              if (browserWs.readyState === WsNode.OPEN)
                browserWs.send(msg, { binary: isBinary })
            })
          })

          pttWs.on('close', () => { if (browserWs.readyState < 2) browserWs.close() })
          browserWs.on('close', () => { if (pttWs.readyState < 2) pttWs.close() })
          pttWs.on('error', (e) => { console.error('[ptt-ws-proxy] PTT error:', e.message); browserWs.close() })
          browserWs.on('error', () => { pttWs.close() })
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pttWsPlugin(),
  ],
  test: {
    environment: 'node',
  },
})
