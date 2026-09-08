# pttzzz Web

目前版本為 `@pttzzz/web-example` `0.1.0`，相依與規則支援範圍見 [package.json](../package.json)。本介面使用 React、Zustand 與 Vite；核心整合方式見 [Building a UI with @pttzzz/core](../../../packages/core/docs/DEVELOPMENT_GUIDE.md)。

本文件記錄 `apps/web` 介面層的呈現取捨與開發細節。核心提供的原始回覆對象與定位是權威資料；呈現規則只改變視覺層級，不改寫核心語意。

## 呈現取捨

### 鍵盤與正文排版

- 首頁首次進入會聚焦第一個可用看板；四方向鍵依畫面位置選看板，Enter 開啟。←／→ 在同一橫列移動，↑／↓ 選擇相鄰方向較接近原欄位的看板。搜尋框已有焦點時不搶焦點。
- 文章列表使用 ↑／↓ 移動焦點，→ 或 Enter 開啟，← 返回。Tab 仍保留原生順序，最愛操作是獨立按鈕。
- 文章按 X 開啟推文／留言，R 開啟回應至看板；看板文章列表按 Ctrl+P 開啟發文。快捷鍵沿用按鈕權限，只開啟編輯器，絕不直接送出。
- 寫入快捷鍵在輸入欄位、編輯區、對話框、IME 組字、文字選取或重複按鍵時不生效；Ctrl+P 必須聚焦於列表而非搜尋輸入框。
- 文章開啟後閱讀區取得焦點，← 返回並恢復先前文章列焦點；輸入框、編輯區、彈窗、IME 與修飾鍵不被列表快捷鍵攔截。
- 正文預設自動換行並預覽媒體；「原始排版」保留空白、換行與等寬排列，超寬內容在區塊內水平捲動。圖片與影片另列於原文之後，不取代表格裡的網址。
- 原始排版保留的是核心提供的正文，不重建 PTT 終端，也不將 ASCII 猜成 HTML 表格。載入中的正文先保留原始排版。
- PTT 相容的粗體／顏色編輯仍是後續階段，不能把現有 Markdown 標記視為 PTT 已支援的格式。

### 文章統計與列表刷新

文章只呈現一列可操作的推／噓票數、聚合後回覆數與「回覆此文」。票數使用核心 `articleVotes`（嵌套規則校正後），不另外並列 PTT 原生統計；回覆數包含所有可見聚合卡片與巢狀回覆，排除隱藏指令及編輯紀錄。

列表刷新重新取得最新頁，舊文章分頁使用嚴格向前推進的游標。重複請求以同步鎖防護，過期回應不得覆蓋新查詢；刷新失敗或回傳空頁時保留既有游標，供再次載入。尚在快取重驗證階段時，不因暫無游標而提前宣告已到最舊。

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
