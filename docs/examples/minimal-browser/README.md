# Minimal browser UI

這是只使用 `@pttzzz/core` 與 `@pttzzz/browser` 公開入口的可執行替代 UI。型別與錯誤細節見 [contracts](../../api/contracts.md)。真實 PTT 連線第一版只保證 browser。

`index.html` 與 `main.ts` 展示 connect/login、看板與文章讀取、partial/final revision gate、stale request gate、巢狀回覆 renderer、以 `replyId` 寫入、write outcome，以及 unsubscribe/disconnect lifecycle。

複製此目錄後執行：

```bash
npm install
npm run dev
```

`package.json` 與 `vite.config.ts` 是可直接使用的 host setup：Vite 注入 legacy `ptt-client` 所需的 `Buffer`，開發伺服器將同源 `/ptt-ws` WebSocket 代理到 `wss://ws.ptt.cc/bbs` 並設定 `Origin: https://term.ptt.cc`。Production 部署也必須提供完全相同的 `/ptt-ws` proxy；Vite build 只產生靜態檔，不會替 production server 建立 proxy。

Credentials 只由頁面表單取得；範例不含帳密、raw floor、terminal driver 或 internal import。
