# 白皮書規則案例

這個目錄把白皮書的核心規則轉成可讀、可執行的案例。白皮書定義規則，JSON fixture 記錄輸入事件與規範期望；現有實作不符合時，應保留紅燈，不能把期望值改成現況。

## 分檔

- `raw.json`：原始事件與樓號。
- `merge.json`：分散推文聚合。
- `thread.json`：嵌套回文與目標關係。
- `vote.json`：文章與回文推噓、去重及撤回。
- `edit.json`：回文補充、替換、區段修改與撤回。
- `op.json`：原發文者標示與文章編輯片段。
- `schema.json`：上述六份 fixture 的共同資料契約。

介面顯示深度不屬於核心規則，案例另放在 `apps/web/docs/fixtures/thread-presentation.json`。

## 細則代號

`primaryRule` 表示案例主要驗證的白皮書細則，例如 `EDIT-002.1`；`rules` 列出案例同時依賴的其他細則，且必須包含 `primaryRule`。每條白皮書第一層編號細則都必須至少成為一個案例的 `primaryRule`。

`expected` 是白皮書要求的結果，不是特定程式的輸出快照。涉及文章計分邊界時，可用 `expectedArticleScores` 同時鎖定提案文章推噓與未經語意排除的 PTT 原生推噓。發送端規則可用 `expectedCommand` 描述操作輸入與預期的 PTT 推文類別／內容；各實作應透過自己的公開操作介面執行案例，確認穩定回文識別、重複操作抑制及最終控制文字。

## 使用方式

這些 fixture 是與程式語言、套件及內部函式無關的符合性案例。實作者可以使用任何架構，只要依序完成下列工作：

1. 使用 `schema.json` 驗證六份案例檔案的資料形狀。
2. 將 `articleAuthor`、`rawPushes`、`opEditedReplies` 與 `stages` 轉換成實作所需的輸入格式；轉換不得預先套用白皮書規則。
3. 執行自己的解析或操作介面，再將結果轉換成 fixture 定義的標準比較格式。
4. 逐欄比較 `expected`，並在案例提供時一併比較 `expectedArticleScores`、`expectedReplyDetails`、`expectedNormalizedEvents`、`stages` 與 `expectedCommand`。
5. 驗證每個 `primaryRule` 都至少有一個案例，且 `rules` 引用的細則都存在於白皮書。

比對陣列時應保留 fixture 所指定的順序；不得只比較數量或部分欄位。沒有出現在標準比較格式中的實作內部資料可以忽略。實作若無法產生某個必要欄位，應將該案例視為不符合，而不是替 fixture 補入實作專屬欄位。

`expectedCommand` 描述的是使用者操作經實作層轉換後應送出的 PTT 類別與文字，或應被阻止的操作。實作者應透過自己的公開操作介面執行它，不應直接呼叫內部文字格式化函式來製造通過結果。

案例與實作結果不一致時，應先判斷實作是否違反白皮書。只有白皮書規則本身變更時，才同步修改 fixture；不得為了配合既有輸出而降低或改寫期望。
