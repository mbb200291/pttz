export type PttTarget = { kind: 'local'; host: string; port: number } | { kind: 'ptt'; url: string }

export function resolvePttTarget(mode: string, env: Record<string, string | undefined>): PttTarget {
  const kind = mode === 'ptt-local' ? 'local' : mode === 'ptt-live' ? 'ptt' : env.PTT_TARGET ?? 'local'
  if (kind === 'ptt') return { kind, url: 'wss://ws.ptt.cc/bbs' }
  if (kind !== 'local') throw new Error('PTT_TARGET must be local or ptt')
  const host = env.PTT_LOCAL_HOST ?? '127.0.0.1'
  const value = env.PTT_LOCAL_PORT ?? '8888'
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('PTT_LOCAL_HOST must be a loopback address')
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('Invalid PTT_LOCAL_PORT')
  return { kind, host, port: Number(value) }
}
