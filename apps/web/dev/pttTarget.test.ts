import { describe, expect, it } from 'vitest'
import { resolvePttTarget } from '../../../dev/pttTarget'

describe('PTT target selection', () => {
  it('defaults to loopback TCP, never the live service', () => {
    expect(resolvePttTarget('development', {})).toEqual({ kind: 'local', host: '127.0.0.1', port: 8888 })
  })
  it('uses config but explicit commands override it', () => {
    expect(resolvePttTarget('development', { PTT_TARGET: 'ptt' }).kind).toBe('ptt')
    expect(resolvePttTarget('ptt-local', { PTT_TARGET: 'ptt' }).kind).toBe('local')
    expect(resolvePttTarget('ptt-live', { PTT_TARGET: 'local' }).kind).toBe('ptt')
    expect(resolvePttTarget('development', { PTT_LOCAL_HOST: 'localhost', PTT_LOCAL_PORT: '9999' })).toEqual({ kind: 'local', host: 'localhost', port: 9999 })
  })
  it.each([{ PTT_TARGET: 'typo' }, { PTT_LOCAL_PORT: '0' }, { PTT_LOCAL_PORT: '8888oops' }, { PTT_LOCAL_PORT: '65536' }, { PTT_LOCAL_HOST: 'ptt.cc' }])('rejects unsafe configuration %j', env => {
    expect(() => resolvePttTarget('development', env)).toThrow()
  })
})
