/**
 * PTT WebSocket Client
 *
 * 管理與 wss://ws.ptt.cc/bbs 的連線、Big5 解碼、以及指令佇列。
 *
 * PTT terminal 是 VT100 terminal，收到的資料是 Big5 bytes。
 * 瀏覽器 WebSocket 收到 binary frame → ArrayBuffer → 以 Big5 解碼成 UTF-8 string。
 */

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "closed";

export interface PttClientOptions {
  onData?: (text: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

// dev 走 Vite proxy（/ptt-ws → wss://ws.ptt.cc/bbs，並注入 Origin: https://term.ptt.cc）
// prod 直連（部署到 term.ptt.cc 同域則不需要 proxy）
const PTT_WS_URL = import.meta.env.DEV
  ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ptt-ws`
  : "wss://ws.ptt.cc/bbs";

// Big5 to UTF-8 via TextDecoder（瀏覽器原生支援 big5）
const decoder = new TextDecoder("big5", { fatal: false });

export class PttClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "idle";
  private options: PttClientOptions;

  // 指令佇列：避免同時送出多個指令搞亂 terminal 狀態
  private cmdQueue: string[] = [];
  private cmdTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PttClientOptions = {}) {
    this.options = options;
  }

  connect(): void {
    if (this.ws && this.status === "connected") return;

    this.setStatus("connecting");
    const ws = new WebSocket(PTT_WS_URL);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus("connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      let text: string;
      if (event.data instanceof ArrayBuffer) {
        text = decoder.decode(new Uint8Array(event.data));
      } else {
        text = event.data as string;
      }
      this.options.onData?.(text);
    };

    ws.onerror = () => {
      this.setStatus("error");
    };

    ws.onclose = () => {
      this.setStatus("closed");
      this.ws = null;
    };
  }

  disconnect(): void {
    if (this.cmdTimer) clearTimeout(this.cmdTimer);
    this.cmdQueue = [];
    this.ws?.close();
    this.ws = null;
  }

  /**
   * 直接送出原始 bytes（Big5 encoded string or control chars）
   * 大多數指令是 ASCII，直接送字串即可。
   */
  send(data: string): void {
    if (!this.ws || this.status !== "connected") return;
    this.ws.send(data);
  }

  /**
   * 加入指令佇列，每隔 delay ms 送出一條，避免 terminal 狀態混亂。
   */
  enqueue(cmd: string, delay = 100): void {
    this.cmdQueue.push(cmd);
    if (!this.cmdTimer) {
      this.flushQueue(delay);
    }
  }

  private flushQueue(delay: number): void {
    if (this.cmdQueue.length === 0) {
      this.cmdTimer = null;
      return;
    }
    const cmd = this.cmdQueue.shift()!;
    this.send(cmd);
    this.cmdTimer = setTimeout(() => this.flushQueue(delay), delay);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
