import { afterEach, describe, expect, it, vi } from "vitest";
import Ptt from "./streamingPtt.js";

// Only replace the network; use the real client and terminal decoder.
class Wire extends EventTarget {
  static last: Wire;
  readyState = 1;
  binaryType = "";
  constructor() { super(); Wire.last = this; }
  send() {}
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  receive(bytes: number[]) {
    this.dispatchEvent(new MessageEvent("message", { data: new Uint8Array(bytes).buffer }));
  }
}
afterEach(() => { vi.clearAllTimers(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("terminal streaming transport", () => {
  it("cancels the inherited idle operation when the socket closes", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", Wire);
    const bot = new Ptt({ charset: "big5", url: "ws://localhost/ptt-ws", terminal: { columns: 80, rows: 24 } });
    Wire.last.dispatchEvent(new Event("open"));
    (bot as unknown as { _state: { login: boolean } })._state.login = true;
    bot.preventIdle(10);
    Wire.last.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("resolves inherited send only after the reply has reached the terminal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", Wire);
    const bot = new Ptt({ charset: "big5", timeout: 40, url: "ws://localhost/ptt-ws", terminal: { columns: 80, rows: 24 } });
    Wire.last.dispatchEvent(new Event("open"));
    const sent = bot.send("Q");
    Wire.last.receive([65]);
    await vi.advanceTimersByTimeAsync(400);
    expect(await sent).toBe(true);
    expect(bot.getLine(0).str).toBe("A");
    Wire.last.close();
  });
  it("preserves decoding for every split of Big5 and ANSI bytes", () => {
    vi.stubGlobal("WebSocket", Wire);
    const bytes = [27, 91, 51, 49, 109, 0xa4, 0xa4, 0xa4, 0xe5, 65];
    for (let split = 0; split <= bytes.length; split++) {
      const bot = new Ptt({ charset: "big5", url: "ws://localhost/ptt-ws", terminal: { columns: 80, rows: 24 } });
      Wire.last.receive(bytes.slice(0, split));
      Wire.last.receive(bytes.slice(split));
      expect(bot.getLine(0).str).toBe("中文A");
      Wire.last.close();
    }
  });
  it("closes oversized input and ignores data after disconnect", () => {
    vi.stubGlobal("WebSocket", Wire);
    const bot = new Ptt({ charset: "big5", url: "ws://localhost/ptt-ws", terminal: { columns: 80, rows: 24 } });
    const error = vi.fn();
    bot.on("error", error);
    Wire.last.receive(Array(1024 * 1024 + 1).fill(65));
    expect(error).toHaveBeenCalledOnce();
    expect(Wire.last.readyState).toBe(3);
    Wire.last.receive([66]);
    expect(bot.getLine(0).str).toBe("");
  });
  it("renders large frames and a Big5 character split across an idle gap", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", Wire);
    const bot = new Ptt({ charset: "big5", blobSize: 1024, timeout: 40,
      url: "ws://localhost/ptt-ws", protocol: "websocket", terminal: { columns: 80, rows: 24 } });
    // 2154 bytes, with a clear-screen escape and a dangling Big5 lead byte.
    Wire.last.receive([...Array(2149).fill(32), 27, 91, 50, 74, 0xa4]);
    await vi.advanceTimersByTimeAsync(100);
    Wire.last.receive([0xa4, 27, 91]);
    await vi.advanceTimersByTimeAsync(100);
    Wire.last.receive([51, 49, 109, 65]);
    await vi.advanceTimersByTimeAsync(100);
    expect(Array.from({ length: 24 }, (_, i) => bot.getLine(i).str).join("\n")).toContain("中A");
    Wire.last.close();
  });
});
