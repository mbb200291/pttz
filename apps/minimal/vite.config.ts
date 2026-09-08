import type { Duplex } from "node:stream";
import { defineConfig, type Plugin } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { WebSocket as PttWebSocket, WebSocketServer } from "ws";

function pttWebSocketProxy(): Plugin {
  return {
    name: "ptt-websocket-origin-proxy",
    configureServer(server) {
      const browserServer = new WebSocketServer({ noServer: true });
      server.httpServer?.on("upgrade", (request, socket: Duplex, head: Buffer) => {
        if (!request.url?.startsWith("/ptt-ws")) return;
        browserServer.handleUpgrade(request, socket, head, (browserSocket) => {
          const pttSocket = new PttWebSocket("wss://ws.ptt.cc/bbs", {
            headers: { Origin: "https://term.ptt.cc" },
          });
          pttSocket.once("open", () => {
            browserSocket.on("message", (message) => {
              if (pttSocket.readyState === PttWebSocket.OPEN) pttSocket.send(message);
            });
            pttSocket.on("message", (message, binary) => {
              if (browserSocket.readyState === PttWebSocket.OPEN) {
                browserSocket.send(message, { binary });
              }
            });
          });
          pttSocket.on("close", () => {
            if (browserSocket.readyState < PttWebSocket.CLOSING) browserSocket.close();
          });
          browserSocket.on("close", () => {
            if (pttSocket.readyState < PttWebSocket.CLOSING) pttSocket.close();
          });
          pttSocket.on("error", () => {
            if (browserSocket.readyState < PttWebSocket.CLOSING) browserSocket.close();
          });
          browserSocket.on("error", () => {
            if (pttSocket.readyState < PttWebSocket.CLOSING) pttSocket.close();
          });
        });
      });
    },
  };
}

export default defineConfig({
  server: { port: 5183 },
  build: { target: "es2022" },
  plugins: [
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    pttWebSocketProxy(),
  ],
});
