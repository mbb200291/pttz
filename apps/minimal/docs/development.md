# 極簡介面開發

- 使用 core/browser 0.3.0 公開 API，對應 rules 0.4.x；聚合、控制事件、嵌套與編輯結果由核心產生。
- 維持唯讀，不加入長回文編輯或 30 段傳送上限的表單；新版長回文的讀取規則隨核心更新。
- `npm run dev:minimal` 預設正式站，根目錄環境檔 `PTT_TARGET` 可覆寫；`:local`／`:ptt` 指令優先於環境檔。本機地址限制 loopback，預設 TCP 8888。
- `dev/` 共用目標解析與 WebSocket／Telnet 代理；host 傳入一致的 pushFormat 與 terminalProtocol。local 僅供開發，禁止 local build／preview。靜態部署仍需提供同源 `/ptt-ws` 代理。
- `apps/shared/ansiText.ts` 與 web 共用安全文字格式投影，只產生文字節點與允許的 CSS，不解讀 HTML。未指定顏色沿用介面；色碼、底色與反白依來源呈現。
- generation、article key、revision 排除過期讀取；返回列表保留 opaque cursor 與捲動位置。正文節點維持穩定，色彩變更也會更新。
- 撤回占位不顯示舊內容或歷史；可見回文使用 originalVersion 與 edits.resultContent，不重播修改指令。
- 預覽只使用公開 fake gateway，不建立 PTT WebSocket。示例資料可保存在瀏覽器 localStorage；正式登入憑證不持久化。

## 驗證

```sh
npm test -w @pttzzz/minimal
npm run build:minimal
npm run verify
```

回歸案例涵蓋終端文字經核心解析後的撤回與編輯歷史、ANSI 安全顯示、漸進更新、列表返回、刪文入口及 local／live 模式。主介面既有 ANSI 與代理測試同時覆蓋共用模組。
