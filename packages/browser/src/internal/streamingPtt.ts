import PttModule from "ptt-client";
import type Config from "ptt-client/dist/config";
// @ts-expect-error terminal.js has no declarations.
import Terminal from "terminal.js";
// @ts-expect-error uao-js has no declarations.
import uao from "uao-js";

const MAX_FRAME_BYTES = 1024 * 1024;
const DECODE_BYTES = 4096;
// Node ESM and Vite expose the upstream Babel default differently.
const Ptt = typeof PttModule === "function" ? PttModule
  : (PttModule as unknown as { default: typeof PttModule }).default;

/** Isolates the ptt-client 0.9 runtime fields used by its inherited methods. */
interface ClientRuntime {
  preventIdleHandler?: ReturnType<typeof setTimeout>;
  config: Config;
  term: { state: { cursor: { x: number; y: number }; setMode(name: string, value: string): void }; write(text: string): void; toString(): string };
  _state: { connect: boolean; login: boolean };
  currentCharset: string;
  socket: { send(data: string): void; disconnect(): void };
}

/** Replaces only ptt-client's timer-batched socket initialization. */
export default class StreamingPtt extends Ptt {
  getCursor(): { x: number; y: number } {
    return { ...(this as unknown as ClientRuntime).term.state.cursor };
  }
  override async init(): Promise<void> {
    const runtime = this as unknown as ClientRuntime;
    runtime.term = new Terminal(runtime.config.terminal);
    runtime.term.state.setMode("stringWidth", "dbcs");
    runtime._state = { connect: false, login: false };
    runtime.currentCharset = "big5";
    const socket = new WebSocket(runtime.config.url);
    socket.binaryType = "arraybuffer";
    let stopped = false;
    let lead: number | undefined;
    const stop = () => { stopped = true; lead = undefined; clearTimeout(runtime.preventIdleHandler); socket.close(); };
    runtime.socket = {
      send: (data) => { if (!stopped && socket.readyState === 1) socket.send(data); },
      disconnect: stop,
    };
    socket.addEventListener("open", () => {
      if (stopped) return;
      runtime._state.connect = true;
      this.emit("connect");
      this.emit("stateChange", this.state);
    });
    socket.addEventListener("close", (event) => {
      stopped = true;
      lead = undefined;
      clearTimeout(runtime.preventIdleHandler);
      runtime._state.connect = false;
      this.emit("disconnect", event);
      this.emit("stateChange", this.state);
    });
    socket.addEventListener("error", () => {
      stop();
      this.emit("error", new Error("PTT transport failed"));
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      if (stopped) return;
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > MAX_FRAME_BYTES) {
        stop();
        this.emit("error", new Error("Invalid or oversized PTT binary frame"));
        return;
      }
      const bytes = new Uint8Array(event.data);
      let encoded = "";
      const flush = () => {
        if (encoded) runtime.term.write(uao.decodeSync(encoded));
        encoded = "";
      };
      // Keep only an incomplete Big5 pair across events. ANSI state belongs to
      // terminal.js and is intentionally not reset at message boundaries.
      for (const byte of bytes) {
        if (lead !== undefined) {
          encoded += String.fromCharCode(lead, byte);
          lead = undefined;
        } else if (byte >= 0x81 && byte <= 0xfe) {
          lead = byte;
        } else {
          encoded += String.fromCharCode(byte);
        }
        if (encoded.length >= DECODE_BYTES) flush();
      }
      flush();
      this.emit("redraw", runtime.term.toString());
      this.emit("message", bytes);
    });
  }
}
