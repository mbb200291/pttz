import { PttzzzClient } from "@pttzzz/core";
import { createBrowserGateway } from "./gateway.js";

export function createBrowserClient(): PttzzzClient {
  return new PttzzzClient(createBrowserGateway());
}
