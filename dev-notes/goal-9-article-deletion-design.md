# Goal 9 文章刪除功能設計

## 目標

讓已登入使用者刪除自己發表的文章。刪除是不可逆操作，UI 必須先顯示瀏覽器原生確認視窗；只有使用者再次確認後才送出 PTT 刪文指令。

## 已決定的互動

- 「刪除」按鈕只在完整文章已載入、目前使用者是文章作者，而且文章具有可重新定位的 index 或 AID 時顯示。
- 作者比對不分英文字母大小寫，與回文投票的 PTT ID 正規化規則一致。
- 按下「刪除」後使用 `window.confirm()` 顯示不可逆警告。
- 使用者取消時不呼叫 adapter，也不改變畫面。
- 刪除送出期間停用刪除按鈕並顯示「刪除中…」，避免重複送出。
- 成功後沿用文章頁既有的 `onBack()` 返回原看板與篩選狀態。
- 失敗時留在原文章頁，顯示 adapter 回傳的原因，允許使用者重新載入後再決定是否重試。

選擇瀏覽器原生確認視窗，而不是自訂 modal，是因為它已提供阻擋誤觸、鍵盤操作與焦點管理；目前需求不需要額外維護一套對話框狀態。

## 公開 API

新增 `DeleteArticleRequest`：

```ts
interface DeleteArticleRequest {
  boardName: string;
  articleIndex: number;
  articleAid?: string;
  expectedAuthor: string;
  expectedTitle: string;
}
```

`articleIndex > 0` 時以 index 定位；從 AID 開啟文章而沒有有效 index 時，使用 `articleAid` 定位。兩者都不可用時直接失敗，不送出任何終端按鍵。

`PttAdapter`、`FakePttAdapter` 與 `usePttActions()` 新增：

```ts
deleteArticle(request: DeleteArticleRequest): Promise<ActionResult>
```

## 正式 PTT 寫入流程

`ptt-client` 沒有高階刪文方法，因此刪文會沿用目前 adapter 的序列化 command queue，透過已登入的 `ptt-client` bot `send()` 操作真實 PTT 終端。這不是前端隱藏文章，也不是 HTTP 刪除。

流程如下：

1. 確認已登入且 bot 具備 `send`、`getLine` 與 `getLines`。
2. 進入指定看板的正常文章列表。
3. 以文章 index 或 `#AID` 開啟文章。
4. 從文章畫面重新解析作者與標題，與 `expectedAuthor`、`expectedTitle` 正規化後比對。
5. 若文章不存在或身分不同，退出文章並回傳失敗，絕不送出刪除鍵。
6. 回到文章列表，使游標保持在剛才核對過的文章列。
7. 由 `ptt-client` bot 送出 `d`，只在辨識到 PTT 刪除確認提示時才送出 `y` 與 Enter。
8. 若出現權限不足、禁止刪除或其他非預期畫面，取消操作並回傳畫面可辨識的錯誤。
9. 確認終端回到指定看板，而且原 index/AID 已無法重新開啟同一作者與標題的文章後，才回傳 `{ ok: true }`。

所有等待都以終端畫面 pattern 與短輪詢判斷，不使用固定 sleep 當作成功依據。任何無法確認的結果都回傳失敗，提示使用者重新整理看板確認，避免把「按鍵已送出」誤報為「刪除成功」。

## Fake Adapter

Fake Adapter 使用同一個 request：

- 未登入、找不到文章、作者不是目前 fake 使用者，或預期作者／標題不符時回傳失敗。
- 驗證通過後從 fake store 移除該文章並保存。
- 後續 `listArticles()` 與 `getArticle()` 不再回傳被刪除文章。

## UI 與錯誤處理

文章頁直接使用既有 `usePttActions()`，不增加全域刪除狀態。刪除錯誤只屬於目前文章，因此保留在 `Article` 元件的 local state，並以 `role="alert"` 顯示在文章操作區附近。

按鈕顯示條件以已載入文章的作者為準；前端條件只改善操作體驗，真正權限仍由 PTT 伺服器決定。Adapter 的身分核對用來防止文章 index 在操作期間改變而誤刪另一篇文章。

## 測試策略

依 TDD 分層測試：

- adapter：缺少能力、定位失敗、身分不符時不送 `d`；正確文章才送 `d`；未出現確認提示時不送 `y`；成功與無法確認結果。
- fake adapter：作者可刪除並持久移除；非作者、身分不符與不存在文章均拒絕。
- action hook：完整轉交 `DeleteArticleRequest`，無 client 時失敗。
- Article UI：只有作者看得到按鈕；取消 confirm 不送出；確認後只送一次；pending 防重複；成功返回看板；失敗留頁並顯示原因。
- regression：完整 `npm test`、`npm run lint`、`npm run build`。

正式 PTT 的自動化測試只使用模擬終端快照，不會在測試或開發過程刪除真實文章。實站刪除只會在使用者登入、開啟自己的文章並於確認視窗再次確認後發生。

## 不在本階段處理

- 刪除他人的文章或板主刪文。
- 復原已刪除文章。
- 批次刪除。
- 刪除或真正改寫既有回文；回文撤回仍是另一項解析工作。
