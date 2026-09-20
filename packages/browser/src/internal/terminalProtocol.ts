export type TerminalProtocol = "local" | "ptt";
const protocols = new WeakMap<object, TerminalProtocol>();

export function setTerminalProtocol(bot: object, protocol: TerminalProtocol): void {
  protocols.set(bot, protocol);
}

export function terminalProtocol(bot: object): TerminalProtocol {
  return protocols.get(bot) ?? "ptt";
}
