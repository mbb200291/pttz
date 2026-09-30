import { afterEach, describe, expect, it } from 'vitest'
import { createServer as httpServer } from 'node:http'
import { createServer as tcpServer, type Socket } from 'node:net'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { attachPttProxy } from '../../../dev/pttProxy'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0 })
async function listen(server: ReturnType<typeof httpServer> | ReturnType<typeof tcpServer>) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  cleanups.push(() => { server.close() })
  return (server.address() as AddressInfo).port
}
async function proxy(target: Parameters<typeof attachPttProxy>[1]) {
  const server = httpServer()
  const dispose = attachPttProxy(server, target)
  cleanups.push(dispose)
  const port = await listen(server)
  return { url: `ws://127.0.0.1:${port}/ptt-ws`, origin: `http://127.0.0.1:${port}` }
}
function connect(url: string, origin: string) {
  const ws = new WebSocket(url, { origin })
  cleanups.push(() => { ws.terminate() })
  return ws
}

describe('PTT development proxy', () => {
  it('round-trips binary bytes through actual TCP without losing early browser input', async () => {
    const tcp = tcpServer(socket => {
      cleanups.push(() => { socket.destroy() })
      socket.on('data', data => socket.write(data))
    })
    const port = await listen(tcp)
    const endpoint = await proxy({ kind: 'local', host: '127.0.0.1', port })
    const ws = connect(endpoint.url, endpoint.origin)
    await once(ws, 'open')
    const received = once(ws, 'message')
    ws.send(Buffer.from([0xa4, 0xa4, 255, 13]))
    const [data, binary] = await received
    expect([...data]).toEqual([0xa4, 0xa4, 255, 13])
    expect(binary).toBe(true)
  })
  it('closes the browser on failed local connection without any live fallback', async () => {
    const tcp = tcpServer(); const port = await listen(tcp)
    await new Promise<void>(resolve => tcp.close(() => resolve()))
    const endpoint = await proxy({ kind: 'local', host: '127.0.0.1', port })
    const ws = connect(endpoint.url, endpoint.origin)
    const [code] = await once(ws, 'close')
    expect(code).toBe(1011)
  })
  it('closes the TCP session when the browser disconnects', async () => {
    const tcp = tcpServer()
    const port = await listen(tcp)
    const accepted = once(tcp, 'connection')
    const endpoint = await proxy({ kind: 'local', host: '127.0.0.1', port })
    const ws = connect(endpoint.url, endpoint.origin)
    await once(ws, 'open')
    const [socket] = await accepted as [Socket]
    cleanups.push(() => { socket.destroy() })
    const closed = once(socket, 'close'); ws.close()
    await closed
    expect(socket.destroyed).toBe(true)
  })
  it('rejects foreign origins before opening a local connection', async () => {
    const endpoint = await proxy({ kind: 'local', host: '127.0.0.1', port: 1 })
    const ws = connect(endpoint.url, 'https://attacker.invalid')
    const [error] = await once(ws, 'error')
    expect(error.message).toContain('403')
  })
  it('does not accept prefix-matching paths', async () => {
    const endpoint = await proxy({ kind: 'local', host: '127.0.0.1', port: 1 })
    const ws = connect(endpoint.url + '-other', endpoint.origin)
    const [error] = await once(ws, 'error')
    expect(error.message).toContain('404')
  })
  it('rejects a matching but non-loopback Host and Origin before dialing upstream', async () => {
    const endpoint = await proxy({ kind: 'local', host: '127.0.0.1', port: 1 })
    const ws = new WebSocket(endpoint.url, { origin: 'http://attacker.invalid', headers: { Host: 'attacker.invalid' } })
    cleanups.push(() => { ws.terminate() })
    const [error] = await once(ws, 'error')
    expect(error.message).toContain('403')
  })
  it('preserves live WS origin and frame type using a controlled upstream', async () => {
    const server = httpServer(); const port = await listen(server)
    const upstream = new WebSocketServer({ server })
    cleanups.push(() => { for (const ws of upstream.clients) ws.terminate(); upstream.close() })
    let origin: string | undefined
    upstream.on('connection', (socket, request) => {
      origin = request.headers.origin
      socket.on('message', (data, binary) => socket.send(data, { binary }))
    })
    const endpoint = await proxy({ kind: 'ptt', url: `ws://127.0.0.1:${port}` })
    const ws = connect(endpoint.url, endpoint.origin)
    await once(ws, 'open')
    const received = once(ws, 'message'); ws.send('hello')
    const [data, binary] = await received
    expect(data.toString()).toBe('hello')
    expect(binary).toBe(false)
    expect(origin).toBe('https://term.ptt.cc')
  })
  it('queues input in order until upstream handshake and discards empty frames', async () => {
    const server = httpServer(); const port = await listen(server)
    const upstream = new WebSocketServer({ noServer: true })
    cleanups.push(() => { for (const ws of upstream.clients) ws.terminate(); upstream.close() })
    const upgrade = once(server, 'upgrade')
    const endpoint = await proxy({ kind: 'ptt', url: `ws://127.0.0.1:${port}` })
    const ws = connect(endpoint.url, endpoint.origin)
    await once(ws, 'open')
    const [request, socket, head] = await upgrade
    ws.send('first'); ws.send(''); ws.send('last')
    // A pong confirms the proxy processed preceding frames while upstream was unavailable.
    const pong = once(ws, 'pong'); ws.ping(); await pong
    const received: string[] = []
    const echoed = once(ws, 'message')
    upstream.handleUpgrade(request, socket, head, connection => {
      connection.on('message', data => {
        received.push(data.toString())
        if (data.toString() === 'last') connection.send(JSON.stringify(received))
      })
    })
    const [data] = await echoed
    expect(JSON.parse(data.toString())).toEqual(['first', 'last'])
  })
})
