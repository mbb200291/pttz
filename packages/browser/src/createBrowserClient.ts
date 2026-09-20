import { PttzzzClient, type PttzzzClientOptions } from "@pttzzz/core";
import { createBrowserGateway } from "./gateway.js";

export function createBrowserClient(options?: PttzzzClientOptions): PttzzzClient {
  return new PttzzzClient(createBrowserGateway(), options);
}
