# PTTzzz 核心規則白皮書

## 文件地位

本白皮書是 PTTzzz 核心解析與狀態語意的 **normative source（規範性來源）**。實作、測試與 machine-readable fixtures 應引用本文的 rule ID。[`goal-7-vote-model-review.html`](../../dev-notes/goal-7-vote-model-review.html) 是 **review example（審查案例）**，用來示範規則結果，不取代本文；[`reply-handling-rule.md`](../../dev-notes/reply-handling-rule.md) 與 [`spec.md`](../../dev-notes/spec.md) 是本版規則的決策來源與歷史脈絡。

本文只規範上述資料已確認的行為。每條案例連結均指向 HTML 中包含該 case 的分類錨點；HTML 未提供單一 case 的錨點。

## 規則分類

| 前綴 | 範圍 |
| --- | --- |
| `RAW-*` | 原始 PTT 推文事件與原始樓號 |
| `THREAD-*` | 可見內容續接聚合、目標解析與巢狀顯示 |
| `VOTE-*` | 文章投票、回文投票、去重與撤回 |
| `EDIT-*` | Append、Replace、Withdraw 與 opaque payload |
| `PARTIAL-*` | 漸進載入期間的暫定與最終狀態 |

## RAW：原始事件與樓號

### RAW-001 原始樓號不等於 UI 順序

- **輸入：** PTT 推文串中的每一行原始事件，包括之後會隱藏的純投票、編輯或撤回控制事件。
- **結果：** 每行依 PTT 原始順序占一個樓號；所有 `x樓`／`xF` 都以該原始樓號定位。聚合卡保留其全部來源樓號，UI 隱藏或聚合事件時不得重編樓號，因此 UI 卡片順序或數量不等於原始樓號。
- **限制：** 樓號只描述原始 PTT 事件位置，不是可見卡片索引；對聚合卡內任一來源樓號的定位都落到同一張卡。參見 [CASE 20、24、25](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)；CASE 20 最直接展示隱藏 13F 後仍顯示 14F。

## THREAD：聚合與巢狀回覆

### THREAD-001 五分鐘聚合

- **輸入：** 同作者的可見片段，兩片段連續，或不連續但時間差不大於五分鐘；前一片段未以 `.。!?！？;；` 終止，且結構目標相同。
- **結果：** 片段聚合為同一張回文卡，並保留每段原始樓號。
- **限制：** 五分鐘限制只適用於不連續片段；不連續且時間無法解析或超過五分鐘、前段有終止符、作者不同、控制事件或結構目標不同時不聚合。連續同作者同目標片段不受時間差限制。參見 [CASE 16](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw) 與 [CASE 19、24、25](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)；CASE 16 展示時間與終止符，CASE 25 展示交錯作者。

### THREAD-002 `||` 強制續接

- **輸入：** 可見片段末尾為 `||`，其後有可由相同作者續接的片段。
- **結果：** 移除顯示內容末尾的 `||`，並強制與後續片段聚合，即使 `||` 前已有終止符。
- **限制：** `||` 只取代終止符造成的續接阻斷；片段仍須為同作者、結構目標相同，且不連續時時間差不大於五分鐘。連續片段不受時間差限制。參見 [CASE 16](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw)；該 case 位於此 HTML 分類末段並展示句號後 `||`。

### THREAD-003 滿行與未滿行拼接

- **輸入：** 已符合聚合條件的相鄰可見片段，前一行具有明確滿行標記，或接近 PTT 單行上限（Big5 約 37 bytes）。
- **結果：** 前一行滿行時直接串接下一片段；未滿行時以換行串接。
- **限制：** 本規則只決定已聚合片段間的分隔方式，不決定能否聚合；HTML 沒有精確展示滿行與未滿行對照，最近案例是 [CASE 16](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw) 的換行聚合。

### THREAD-004 支援的巢狀目標 pattern

- **輸入：** 行首的 `回x樓`、`回xf`／`回xF`、`TO xf`／`TO xF`、`reply to xf`／`reply to xF` 或 `>>xf`／`>>xF`，後接結束、半形／全形空白或 `:`／`：`。
- **結果：** 移除 pattern，將 body 掛到原始 xF 所屬卡片下；pattern 本身不投票。
- **限制：** pattern 必須在行首且符合分隔邊界；取出的 body 不遞迴解析。HTML 只精確示範 `回x樓`，參見 [CASE 03、04](../../dev-notes/goal-7-vote-model-review.html#replies)；其他形式由規格確認但無個別 HTML case。

### THREAD-005 投票加文字同時是回覆與投票

- **輸入：** 行首 `推x樓`、`x樓推一個` 或 `噓x樓`，且 pattern 後有 body。
- **結果：** 同一原始事件同時更新 xF 的回文票，並把移除 pattern 後的 body 顯示為 xF 的巢狀回覆。
- **限制：** body 不再遞迴解析；事件的 PTT 類別仍依 VOTE-003 獨立影響文章原生分數。參見 [CASE 17](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

### THREAD-006 續行不跨 target

- **輸入：** 同作者可聚合的後續 body，以及由先前片段繼承或由新 pattern 明示的結構目標。
- **結果：** 沒有新 pattern 的續行可繼承上一片段目標；出現不同目標時另開群組。
- **限制：** 即使作者相同、時間在五分鐘內且前句未終止，也不得跨不同 target 聚合。參見 [CASE 19](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

### THREAD-007 最深三層

- **輸入：** 原始目標關係形成四層或更深的回覆鏈。
- **結果：** UI 最多顯示三層；第四層以上提升為第三層同層節點。
- **限制：** 提升只改顯示層級，背後仍保留原始 target，投票與定位仍使用原始樓號。參見 [CASE 15](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw)。

## VOTE：文章票與回文票

### VOTE-001 純文章票

- **輸入：** 內容去除前後空白後只有 `推` 或 `噓` 的原始推文。
- **結果：** 視為純文章投票，不產生討論串卡片；應用層文章投票狀態與 PTT 類別造成的原生分數分別更新。
- **限制：** 只有完整純內容才符合；含其他 body 的一般留言不屬此規則。參見 [CASE 05、06](../../dev-notes/goal-7-vote-model-review.html#article-votes)。

### VOTE-002 純回文票

- **輸入：** 行首回文投票 pattern 後沒有 body。
- **結果：** 更新目標原始樓號的回文票，事件本身隱藏且不生成回文卡。
- **限制：** 純投票是獨立控制事件，不與前後可見內容聚合，也不吞掉下一則留言。參見 [CASE 07、08](../../dev-notes/goal-7-vote-model-review.html#reply-votes) 與 [CASE 20](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

### VOTE-003 PTT 類別影響文章原生分數

- **輸入：** 每一筆原始推文的 PTT 類別 `推`、`噓` 或 `→`，不論內容 intent。
- **結果：** 文章原生分數分別加一、減一或不變。
- **限制：** 內容 pattern 不改變此計算；因此 PTT 類別與回文投票方向可以相反。PTTzzz 自己送出回文票時使用 `→`，避免額外改變文章分數。參見 [CASE 11、12](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw)。

### VOTE-004 回文票依內容 pattern

- **輸入：** 行首 `推x樓`、`x樓推一個` 或 `噓x樓`，符合結束、空白或冒號分隔邊界。
- **結果：** 由內容 pattern 決定目標樓與 `+1`／`-1` 方向，忽略該事件的 PTT 類別。
- **限制：** pattern 只在行首解析一次；如 `推12樓主` 未符合分隔邊界，視為一般文字。參見 [CASE 07、08](../../dev-notes/goal-7-vote-model-review.html#reply-votes)、[CASE 12](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw) 與 [CASE 18](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

### VOTE-005 同帳號最後方向與同方向去重

- **輸入：** 同一帳號對同一原始目標樓的多筆有效回文投票事件。
- **結果：** 只保留最後方向；同方向重複仍只計一票。帶 body 的歷史可見回覆不因改票而刪除。
- **限制：** 去重鍵包含帳號與目標樓；PTTzzz 發送端應阻止同方向重送，解析端仍須處理其他客戶端留下的重複事件。參見 [CASE 09、10](../../dev-notes/goal-7-vote-model-review.html#reply-votes) 與 [CASE 21](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

### VOTE-006 撤回

- **輸入：** 原始解析輸入是 `撤回我對x樓的推`／`撤回我對x樓的噓` 回文撤回控制事件。文章撤回則是 UI 操作脈絡：撤回推時送出 PTT `噓` 類別、純內容 `噓`；撤回噓時送出 PTT `推` 類別、純內容 `推`。
- **結果：** 回文撤回事件只清除該帳號對 xF 的對應應用層回文票，保留複合事件的可見 body。raw-only reduction 慣例將同作者相反方向的第二筆純文章票視為抵銷，清除應用層文章投票狀態；第三筆純文章票才建立其新方向。每一筆 PTT `type` 仍各自計入原生文章分數，因此反向票會抵銷 native score。
- **限制：** 反向純文章票在 raw parsing 上與 VOTE-001 的一般純文章票無法區分；raw-only reduction 採上述 opposite-pair cancellation 慣例。PTT 原生推噓不能刪除；回文票撤回與整則發言 Withdraw 是不同操作。PTTzzz 的回文票撤回使用 `→` 且控制事件隱藏。參見 [CASE 14](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw) 與 [CASE 22](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

## EDIT：編輯與發言撤回

### EDIT-001 只解析 outer command

- **輸入：** 接受的歷史輸入 pattern 是 `補充我在 x樓 說的：payload`（Append）、`修正我在 x樓 的說法：payload`（Replace）、`更正一下我在x樓的回覆：payload`（Replace）及 `撤回我在x~y樓的發言`（Withdraw）。單樓 Withdraw 亦接受 `撤回我在x樓的發言`。PTTzzz 編輯按鈕的 canonical output pattern 分別是 `補充我在x樓發言：payload`、`更正我在x樓發言：payload`、`撤回我在x~y樓發言`；canonical output 與相容的歷史輸入不是同一份格式清單。
- **結果：** 只解析最外層指令，依原始樓號定位事件；Append 補充 body，Replace 替換 body，Withdraw 撤回指定事件或範圍。若撤回的是投票加回覆複合事件，其 body 與該事件帶來的票一起失效。
- **限制：** 編輯只作用於已定位事件，不得改變其既有解析結構；HTML 精確示範 Replace 與單筆 Withdraw，Append 及範圍 Withdraw 無個別 case。參見 [CASE 13、23](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw)。

### EDIT-002 opaque payload

- **輸入：** Append 或 Replace outer command 後的 payload，即使其中包含回覆、投票、撤回或另一編輯 pattern。
- **結果：** payload 作為 opaque text 更新 body，不再次解析；原事件的 `replyTo`、投票目標、投票方向與可見性維持不變。
- **限制：** opaque 規則只適用於編輯 payload，不改變一般原始推文首次解析的規則。參見 [CASE 13](../../dev-notes/goal-7-vote-model-review.html#invalid-withdraw)。

### EDIT-003 Withdraw 保留空格

- **輸入：** 有效的發言 Withdraw 指令定位到一筆或一段原始事件。
- **結果：** 被撤回 body 的內容以單一空格作為占位；若事件含回文票，該事件的票同時失效。
- **限制：** 占位是解析後內容狀態，不得造成原始樓號重編；HTML CASE 23 展示整筆撤回效果，但沒有精確呈現空格占位，參見 [CASE 23](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries)。

## PARTIAL：漸進載入

### PARTIAL-001 incomplete 與 final

- **輸入：** 尚未讀完的文章推文事件序列，及後續抵達的新事件，直到來源確認完整。
- **結果：** 讀取期間輸出 `incomplete` 狀態並近乎即時逐步渲染目前可得結果；來源完成後輸出 `final` 狀態，依完整事件序列得到最終聚合、巢狀、投票與編輯結果。
- **限制：** `incomplete` 是暫定投影，後續事件可能續接卡片、改票、編輯或撤回，消費端不得把它視為不可變最終結果；`final` 只表示目前來源已完整，不新增其他產品行為。HTML 沒有漸進載入專屬 case；最近的 [CASE 19](../../dev-notes/goal-7-vote-model-review.html#parse-boundaries) 只展示後續事件如何改變聚合與 target，並非載入狀態案例。
