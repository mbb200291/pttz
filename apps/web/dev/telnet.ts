/** Streaming Telnet framing; terminal bytes are never decoded as UTF-8. */
export class TelnetCodec {
  private state: 'data' | 'iac' | 'option' | 'sub' | 'sub-iac' = 'data'
  private command = 0
  private sub: number[] = []
  private local = new Map<number, boolean>()
  private remote = new Map<number, boolean>()

  constructor(private readonly reply: (data: Buffer) => void) {}

  encode(data: Buffer): Buffer {
    const output: number[] = []
    for (const byte of data) { output.push(byte); if (byte === 255) output.push(byte) }
    return Buffer.from(output)
  }

  decode(data: Buffer): Buffer {
    const output: number[] = []
    for (const byte of data) {
      switch (this.state) {
        case 'data':
          if (byte === 255) this.state = 'iac'
          else output.push(byte)
          break
        case 'iac':
          if (byte === 255) { output.push(byte); this.state = 'data' }
          else if ([251, 252, 253, 254].includes(byte)) { this.command = byte; this.state = 'option' }
          else if (byte === 250) { this.sub = []; this.state = 'sub' }
          else this.state = 'data'
          break
        case 'option':
          this.negotiate(byte)
          this.state = 'data'
          break
        case 'sub':
          if (byte === 255) this.state = 'sub-iac'
          else this.sub.push(byte)
          break
        case 'sub-iac':
          if (byte === 240) {
            if (this.local.get(24) && this.sub.length === 2 && this.sub[0] === 24 && this.sub[1] === 1) {
              this.reply(Buffer.from([255, 250, 24, 0, ...Buffer.from('VT100'), 255, 240]))
            }
            this.sub = []; this.state = 'data'
          } else { if (byte === 255) this.sub.push(255); this.state = 'sub' }
          break
      }
      if (this.sub.length > 1024) throw new Error('Telnet subnegotiation exceeds limit')
    }
    return Buffer.from(output)
  }

  private negotiate(option: number) {
    const incomingWill = this.command === 251 || this.command === 252
    const states = incomingWill ? this.remote : this.local
    const enable = this.command === 251 || this.command === 253
    const allowed = (incomingWill ? [0, 1, 3] : [0, 3, 24, 31]).includes(option)
    const accepted = enable && allowed
    if (states.get(option) === accepted) return
    const previous = states.get(option)
    states.set(option, accepted)
    if (enable || previous === true) this.reply(Buffer.from([255, incomingWill ? accepted ? 253 : 254 : accepted ? 251 : 252, option]))
    if (!incomingWill && accepted && option === 31) this.reply(Buffer.from([255, 250, 31, 0, 80, 0, 24, 255, 240]))
  }
}
