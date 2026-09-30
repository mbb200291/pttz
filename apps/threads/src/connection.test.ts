import { describe, expect, it } from 'vitest'
import { browserConnectionOptions } from './connection'

describe('Threads browser connection options', () => {
  it('uses local push formatting and terminal protocol only for the local Vite target', () => {
    expect(browserConnectionOptions('local')).toEqual({ pushFormat: 'local', terminalProtocol: 'local' })
  })

  it('defaults unknown and absent build-time values to the live terminal contract', () => {
    expect(browserConnectionOptions()).toEqual({ pushFormat: 'ptt', terminalProtocol: 'ptt' })
    expect(browserConnectionOptions('unexpected')).toEqual({ pushFormat: 'ptt', terminalProtocol: 'ptt' })
  })
})
