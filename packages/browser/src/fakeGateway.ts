import type { PttGateway } from "@pttzzz/core";
import { BrowserPttGateway } from "./gateway.js";
import { createFakeTerminalDriver } from "./internal/fakeTerminalDriver.js";

export function createFakeBrowserGateway(): PttGateway {
  return new BrowserPttGateway(createFakeTerminalDriver());
}
