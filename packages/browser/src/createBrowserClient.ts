import { PttzzzClient, type PttzzzClientOptions } from "@pttzzz/core";
import { createBrowserGateway } from "./gateway.js";

export interface BrowserClientOptions extends PttzzzClientOptions {
  pushFormat?: "local" | "ptt";
  terminalProtocol?: "local" | "ptt";
}

export function createBrowserClient(options?: BrowserClientOptions): PttzzzClient {
  const { pushFormat = "ptt", terminalProtocol = "ptt", ...clientOptions } = options ?? {};
  return new PttzzzClient(createBrowserGateway({ pushFormat, terminalProtocol }), clientOptions);
}
