import { loadEnv, type Plugin } from 'vite'
import { attachPttProxy } from './pttProxy'
import { resolvePttTarget, type PttTarget, type PttTargetKind } from './pttTarget'

export type PttConnectionConfig = Readonly<{
  label: string
  pushFormat: 'local' | 'ptt'
  terminalProtocol: 'local' | 'ptt'
}>

export type PttViteOptions = Readonly<{
  command: string
  mode: string
  isPreview: boolean
  envDir: string
  defaultTarget?: PttTargetKind
}>

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

export function resolvePttViteConfig(options: PttViteOptions): Readonly<{
  target: PttTarget
  connection: PttConnectionConfig
  define: Record<string, string>
  plugin: Plugin
}> {
  const { command, mode, isPreview, envDir, defaultTarget = 'local' } = options
  if ((command === 'build' || isPreview) && mode === 'ptt-local') {
    throw new Error('local PTT is development-only; use npm run dev:local')
  }
  if (command === 'serve' && !isPreview && process.env.NODE_ENV === 'production') {
    throw new Error('PTT development server requires development NODE_ENV')
  }
  const target = command === 'serve' && !isPreview
    ? resolvePttTarget(mode, loadEnv(mode, envDir, 'PTT_'), defaultTarget)
    : resolvePttTarget('ptt-live', {})
  const connection: PttConnectionConfig = Object.freeze(target.kind === 'local'
    ? { label: `本機 PTT（${target.host}:${target.port}）`, pushFormat: 'local', terminalProtocol: 'local' }
    : { label: '正式 PTT（ws.ptt.cc）', pushFormat: 'ptt', terminalProtocol: 'ptt' })
  return Object.freeze({
    target,
    connection,
    define: {
      'import.meta.env.VITE_PTT_CONNECTION_LABEL': JSON.stringify(connection.label),
      'import.meta.env.VITE_PTT_PUSH_FORMAT': JSON.stringify(connection.pushFormat),
    },
    plugin: pttWsPlugin(target),
  })
}
