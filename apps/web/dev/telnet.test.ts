import { describe, expect, it } from 'vitest'
import { TelnetCodec } from './telnet'

describe('Telnet binary transport', () => {
  it('preserves Big5 and escaped IAC across arbitrary packet splits', () => {
    const replies: Buffer[] = []
    const codec = new TelnetCodec(data => replies.push(data))
    const output = [[0xa4], [0xa4, 255], [255, 0x0d, 0x0a]].map(part => codec.decode(Buffer.from(part)))
    expect([...Buffer.concat(output)]).toEqual([0xa4, 0xa4, 255, 13, 10])
    expect([...codec.encode(Buffer.from([0xa4, 0xa4, 255, 13]))]).toEqual([0xa4, 0xa4, 255, 255, 13])
  })
  it('negotiates binary, suppress-go-ahead and rejects unsupported options without leaking control bytes', () => {
    const replies: Buffer[] = []
    const codec = new TelnetCodec(data => replies.push(data))
    expect(codec.decode(Buffer.from([255, 251])).length).toBe(0)
    expect([...codec.decode(Buffer.from([0, 255, 253, 0, 255, 251, 3, 255, 253, 42, 65]))]).toEqual([65])
    expect(replies.map(b => [...b])).toEqual([[255, 253, 0], [255, 251, 0], [255, 253, 3], [255, 252, 42]])
    codec.decode(Buffer.from([255, 251, 0]))
    expect(replies).toHaveLength(4)
  })
  it('provides fixed terminal type and dimensions only after negotiation', () => {
    const replies: Buffer[] = []
    const codec = new TelnetCodec(data => replies.push(data))
    codec.decode(Buffer.from([255, 253, 31, 255, 253, 24, 255, 250, 24, 1, 255]))
    codec.decode(Buffer.from([240]))
    expect(replies.map(b => [...b])).toEqual([
      [255, 251, 31], [255, 250, 31, 0, 80, 0, 24, 255, 240], [255, 251, 24],
      [255, 250, 24, 0, 86, 84, 49, 48, 48, 255, 240],
    ])
  })
})
