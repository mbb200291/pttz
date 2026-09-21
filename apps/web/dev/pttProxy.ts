import { createConnection, type Socket } from 'node:net'
import type { IncomingMessage } from 'node:http'
import type { EventEmitter } from 'node:events'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { PttTarget } from './pttTarget'
import { TelnetCodec } from './telnet'

const MAX_PENDING = 64 * 1024
const MAX_BUFFERED = 1024 * 1024
const bytes = (data: RawData): Buffer => Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Uint8Array)

function isLocalOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol)
      && origin === `${url.protocol}//${host}`
      && url.origin === origin
  } catch { return false }
}

/** Installs only the PTT route; Vite retains ownership of its HMR upgrades. */
export function attachPttProxy(server: EventEmitter, target: PttTarget): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PENDING })
  const sessions = new Set<() => void>()
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = request.url?.split('?')[0]
    if (path !== '/ptt-ws') {
      if (path?.startsWith('/ptt-ws')) socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    const origin = request.headers.origin
    if (!isLocalOrigin(origin, request.headers.host)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    wss.handleUpgrade(request, socket, head, browser => {
      let tcp: Socket | undefined
      let upstream: WebSocket | undefined
      let ready = false
      let stopped = false
      let pendingBytes = 0
      const pending: { data: Buffer; binary: boolean }[] = []
      const timer = setTimeout(() => stop(1011), 7000)
      const stop = (code = 1000) => {
        if (stopped) return
        stopped = true
        clearTimeout(timer)
        pending.length = 0
        tcp?.destroy()
        upstream?.terminate()
        if (browser.readyState === WebSocket.OPEN) browser.close(code)
      }
      const dispose = () => { stop(); browser.terminate(); sessions.delete(dispose) }
      sessions.add(dispose)
      const codec = new TelnetCodec(data => {
        if (tcp && !tcp.destroyed) tcp.write(data)
      })
      const forward = (data: Buffer, binary: boolean) => {
        if ((tcp?.writableLength ?? upstream?.bufferedAmount ?? 0) > MAX_BUFFERED) return stop(1013)
        if (tcp) tcp.write(codec.encode(data))
        else upstream?.send(data, { binary }, error => { if (error) stop(1011) })
      }
      const opened = () => {
        if (stopped) return
        clearTimeout(timer); ready = true
        for (const item of pending) { if (!stopped) forward(item.data, item.binary) }
        pending.length = 0; pendingBytes = 0
      }
      const receive = (data: Buffer, binary: boolean) => {
        if (browser.bufferedAmount > MAX_BUFFERED) return stop(1013)
        if (data.length && browser.readyState === WebSocket.OPEN) browser.send(data, { binary }, error => { if (error) stop(1011) })
      }
      browser.on('message', (raw, binary) => {
        if (stopped) return
        const data = bytes(raw)
        if (data.length === 0) return
        if (ready) forward(data, binary)
        else {
          pendingBytes += data.length
          if (pendingBytes > MAX_PENDING) return stop(1009)
          pending.push({ data, binary })
        }
      })
      browser.on('close', () => { stop(); sessions.delete(dispose) })
      browser.on('error', () => stop(1011))
      if (target.kind === 'local') {
        tcp = createConnection({ host: target.host, port: target.port })
        tcp.on('connect', opened)
        tcp.on('data', (data: Buffer) => {
          try { receive(codec.decode(data), true) } catch { stop(1011) }
        })
        tcp.on('error', () => stop(1011))
        tcp.on('close', () => stop())
      } else {
        upstream = new WebSocket(target.url, { headers: { Origin: 'https://term.ptt.cc' }, handshakeTimeout: 6500 })
        upstream.on('open', opened)
        upstream.on('message', (data, binary) => receive(bytes(data), binary))
        upstream.on('error', () => stop(1011))
        upstream.on('close', () => stop())
      }
    })
  }
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    server.off('upgrade', upgrade)
    server.off('close', dispose)
    for (const close of sessions) close()
    wss.close()
  }
  server.on('upgrade', upgrade)
  server.once('close', dispose)
  return dispose
}
