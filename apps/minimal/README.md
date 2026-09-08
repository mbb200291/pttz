# pttzzz / minimal

獨立的 ASCII-like 唯讀 PTT 閱讀器。使用 vanilla TypeScript 與語意 HTML，不是 terminal emulator，也不解析 Markdown。只依賴 `@pttzzz/core` / `@pttzzz/browser` 0.1.0 公開入口，支援 rules 0.1.x。

## 啟動

從 monorepo 根目錄：

```sh
npm ci
npm run build:packages
npm run dev:minimal
```

開啟 `http://localhost:5183/?preview=1` 使用公開 `@pttzzz/browser/testing` fake gateway。自動以虛構 preview 帳號登入；不開啟 PTT WebSocket。fake gateway 本身會將示例文章存於瀏覽器 localStorage，虛構使用者存於 sessionStorage；這不是正式登入憑證。

不帶 preview 時，按下登入才連線 PTT。初次登入預設保留其他連線；只有偵測到 duplicate_login 才出現「保留／中斷並繼續」選項。不會自動踢除其他 session。UI 清空密碼欄位、不儲存帳密。

```sh
npm test -w @pttzzz/minimal
npm run build:minimal
npm run preview:minimal
```

`npm run build`、`npm test`、`npm run verify` 已涵蓋本 app，預設 `npm run dev` 仍開啟既有 web app。

## 範圍

- 熱門與指定看板、看板／文章分頁、文章漸進讀取與 final 狀態。
- 正文保留空白與換行，區塊可水平捲動；可選自動折行（表格可能失去對齊）。
- 聚合回覆依核心 children/visible 呈現；最多三級視覺縮排，保留原始 DOM 關係與回覆作者標籤。
- 顯示核心依嵌套回文規則校正後的文章評分（`articleVotes`）與回覆評分，以及文章／回覆編輯紀錄；不另顯示 PTT 原生統計。
- 不提供發文、回覆、投票、編輯、撤回、圖片展開、全域鍵盤快捷鍵或自動重試。

## Host 與生命週期

Vite host 注入 legacy `ptt-client` 的 Buffer 相容層，開發 proxy `/ptt-ws` 指向 `wss://ws.ptt.cc/bbs` 並設定 `Origin: https://term.ptt.cc`。**Production 靜態 build 不包含 proxy**；部署主機必須提供相同的同源 WebSocket proxy。

按下首次登入才建立 client。每次登入清空 session-scoped snapshot／cursor；登出、斷線或非 duplicate 登入失敗後，使用「重新載入並登入」重新開始，因現有 browser driver 在同頁為 singleton，建立另一個 client 並不能重建已關閉的 transport。duplicate prompt 續答沿用原連線，保留選項為 false，只有明確中斷才傳 true。

讀取以 generation、ArticleKey、revision 排除過期結果，final 不會被晚到 partial 降級。正文 DOM 在 partial 更新時保留，完整編輯歷程於 final 顯示。pagehide 釋放訂閱和連線，BFCache 還原會重新載入。

CSS 行為參考 [MDN white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space)，互動使用 [原生 button](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button) 與可見焦點。
