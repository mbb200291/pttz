# pttzzz Web

目前版本為 `@pttzzz/web-example` `0.2.0`，相依與規則支援範圍見 [package.json](../package.json)。本介面使用 React、Zustand 與 Vite；核心整合方式見 [Building a UI with @pttzzz/core](../../../packages/core/docs/DEVELOPMENT_GUIDE.md)。

本文件記錄 `apps/web` 介面層的呈現取捨與開發細節。核心提供的原始回覆對象與定位是權威資料；呈現規則只改變視覺層級，不改寫核心語意。

## 呈現取捨

### WEB-THREAD-001 最大顯示深度K選擇

1. Web 介面的最大顯示深度為三層。
2. 原始深度超過三層的回覆，提升為第三層的同層節點。
3. 提升只影響顯示父節點；回覆、推噓、編輯與撤回仍使用核心提供的原始 `replyId` 與回覆對象。

對應案例位於 [`fixtures/thread-presentation.json`](./fixtures/thread-presentation.json)。

## 與其他層的關係

Web UI 不重新定義白皮書規則，也不直接解析 PTT 終端文字。介面只使用核心公開資料與事件；想了解討論語意，請先閱讀[核心白皮書](../../../docs/whitepaper/pttzzz-core.md)；想建立另一種 UI，請依照[UI 開發指南](../../../packages/core/docs/DEVELOPMENT_GUIDE.md)使用 `@pttzzz/core` 與 gateway。

介面層不需要執行核心 fixture 來決定畫面樣式。若同時修改核心解析或資料契約，應回到[規則案例契約](../../../docs/fixtures/thread-events/README.md)與[核心套件契約](../../../packages/core/docs/contracts.md)確認語意與欄位，再更新介面。

## 預覽模式

開發網頁介面時，可以不登入 PTT，直接使用 query parameter 檢視不同畫面：

- `?preview=home`
- `?preview=board`
- `?preview=article`
- `?preview=login`

例如：`http://localhost:5173/?preview=home`

這些模式只供開發與視覺檢查使用，不是核心實作層或公開 UI 契約的一部分。
