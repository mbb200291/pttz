export type ThreadsConnectionOptions = Readonly<{
  pushFormat: 'local' | 'ptt'
  terminalProtocol: 'local' | 'ptt'
}>

export function browserConnectionOptions(pushFormat?: string): ThreadsConnectionOptions {
  return Object.freeze(pushFormat === 'local'
    ? { pushFormat: 'local', terminalProtocol: 'local' }
    : { pushFormat: 'ptt', terminalProtocol: 'ptt' })
}
