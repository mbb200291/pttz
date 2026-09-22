import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfigFromFile } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolvePttTarget } from '../../../dev/pttTarget'

afterEach(() => vi.unstubAllEnvs())
const path = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

async function loadThreadsConfig(mode = 'development') {
  return loadConfigFromFile({ command: 'serve', mode }, path)
}

describe('Threads Vite target wiring', () => {
  it('uses the local terminal contract when selected explicitly', async () => {
    vi.stubEnv('PTT_TARGET', 'ptt')
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'ptt-local' }, path)
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_CONNECTION_LABEL']).toContain('本機 PTT')
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_PUSH_FORMAT']).toBe('"local"')
  })

  it('uses the live terminal contract when selected explicitly', async () => {
    vi.stubEnv('PTT_TARGET', 'local')
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'ptt-live' }, path)
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_CONNECTION_LABEL']).toContain('ws.ptt.cc')
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_PUSH_FORMAT']).toBe('"ptt"')
  })

  it('defaults to the live terminal contract without PTT_TARGET', () => {
    expect(resolvePttTarget('development', {}, 'ptt')).toEqual({ kind: 'ptt', url: 'wss://ws.ptt.cc/bbs' })
  })

  it('honors a configured local target outside explicit modes', async () => {
    vi.stubEnv('PTT_TARGET', 'local')
    const loaded = await loadThreadsConfig()
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_PUSH_FORMAT']).toBe('"local"')
  })

  it('refuses local builds and previews', async () => {
    await expect(loadConfigFromFile({ command: 'build', mode: 'ptt-local' }, path)).rejects.toThrow('local')
    await expect(loadConfigFromFile({ command: 'serve', mode: 'ptt-local', isPreview: true }, path)).rejects.toThrow('local')
  })
})
