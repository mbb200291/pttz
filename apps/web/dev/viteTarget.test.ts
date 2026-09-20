import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfigFromFile } from 'vite'
import { fileURLToPath } from 'node:url'

afterEach(() => vi.unstubAllEnvs())
const path = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
describe('Vite target wiring', () => {
  it('selects local explicitly without exposing test credentials', async () => {
    vi.stubEnv('PTT_TARGET', 'ptt')
    vi.stubEnv('PTT_LOCAL_PASSWORD_1', 'private-sentinel-never-in-client')
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'ptt-local' }, path)
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_CONNECTION_LABEL']).toContain('本機 PTT')
    expect(JSON.stringify(loaded?.config.define)).not.toContain('private-sentinel')
  })
  it('selects live explicitly even when environment selects local', async () => {
    vi.stubEnv('PTT_TARGET', 'local')
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'ptt-live' }, path)
    expect(loaded?.config.define?.['import.meta.env.VITE_PTT_CONNECTION_LABEL']).toContain('ws.ptt.cc')
  })
  it('refuses a local-mode production build instead of silently connecting to live PTT', async () => {
    await expect(loadConfigFromFile({ command: 'build', mode: 'ptt-local' }, path)).rejects.toThrow('local')
  })
})
