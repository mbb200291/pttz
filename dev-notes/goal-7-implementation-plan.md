# Goal 7 實作計畫：發文、回文、投票、上傳圖片

**Goal:** 為 pttzzz 加入完整的發文/回文/推噓/編輯功能前端 UI，搭配本地狀態管理，並預留對接 PTT adapter 的 hook 介面。

**Architecture:**
`VotePair` 負責推噓按鈕邏輯（含 hover 投票者 popover）；`Composer` 是回文/編輯回文的 Modal；`ComposeScreen` 是發文/修改文章的全頁面。後兩者都在 `Article.tsx` 中以本地 state 控制開關。`App.tsx` 加入 `compose` / `compose-edit` 兩個 view 路由。所有對 PTT 的實際寫入動作封裝在 `usePttActions` hook 裡，目前以 stub 實作，後續可獨立補上 adapter 整合。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand（現有）, ptt-client（現有）, Vitest（現有）

---

## 檔案結構

| 路徑                               | 狀態        | 負責什麼                                         |
| ---------------------------------- | ----------- | ------------------------------------------------ |
| `src/lib/ptt/pushAggregator.ts`    | ✅ 修改完成 | 收集真實推噓者名單 + dedup                       |
| `src/components/VotePair.tsx`      | ✅ 新增完成 | 推/噓按鈕對 + hover 投票者 popover（真實資料）   |
| `src/hooks/usePttActions.ts`       | ✅ 新增完成 | PTT 寫入動作 stub + canVote() + 格式函式         |
| `src/components/Composer.tsx`      | ⚠️ 需修改   | 回文 / 編輯回文 Modal（圖片改為 Imgur 串接）     |
| `src/lib/imgur.ts`                 | 待實作      | Imgur 匿名上傳 API 封裝，回傳短網址              |
| `src/components/ComposeScreen.tsx` | 待實作      | 發文 / 修改文章 全頁面                           |
| `src/components/PushThread.tsx`    | 待修改      | 加入 action row（回覆、投票、編輯、歷史）        |
| `src/components/Article.tsx`       | 待修改      | 加入文章級投票區、回文/修改按鈕、Composer 控制   |
| `src/App.tsx`                      | 待修改      | 加入 compose / compose-edit 路由，傳 currentUser |

---

## ✅ Task 0：pushAggregator 收集投票者 + dedup

**修改檔案：** `src/lib/ptt/pushAggregator.ts`

### 完成內容

- `AggregatedPush` 新增 `pushVoters: string[]`、`booVoters: string[]`
- 新增 `detectVote(content)` 純函式，匹配 `推X樓` / `X樓推一個` / `噓X樓`
- `aggregatePushes` 內新增 Step 2b：遍歷原始推文，找到投票 pattern 後，將 author 加入目標 push 的 voters，dedup 規則為後者蓋前者（同 author 對同 push 先推後噓，最終算噓）
- 所有現有 `AggregatedPush` 字面量補上 `pushVoters: []` / `booVoters: []`

---

## ✅ Task 1：VotePair 元件

**新增檔案：** `src/components/VotePair.tsx`

### 完成內容

- Props：`value`, `count`, `onPush`, `onBoo`, `voters?: { push, boo }`, `myVote?: -1|0|1`, `size?`
- 推 active（value=1）綠色；噓 active（value=-1）紅色
- `myVote === 1` → 推按鈕 disabled；`myVote === -1` → 噓按鈕 disabled
- Hover 220ms 後展開 VoterPopover（portal 到 body），80ms 後關閉
- VoterPopover 顯示真實 voters 名單（從 prop 取得，非假資料）
  - count=0 → "還沒有人推/噓"
  - count ≤ 12 → 2 欄顯示
  - count 13–80 → 前 12 人 + "…還有 X 人"
  - count > 80 → "推爆/噓爆 · 共 N 人，不顯示完整名單"

---

## ✅ Task 2：usePttActions Hook

**新增檔案：** `src/hooks/usePttActions.ts`

### 完成內容

- 純函式：`formatReplyToPush`, `formatEditPush`, `formatArticleVote`, `formatPushVote`
- `canVote(myVote, direction) → boolean`：同方向重複投票返回 false
- Hook：`usePttActions()` 回傳 `isLoggedIn` + 7 個 stub 方法（300ms delay, `{ ok: true }`）

---

## ✅ Task 3：Composer Modal

**新增檔案：** `src/components/Composer.tsx`

### 完成內容

- 三種模式：`reply`（回文）/ `reply-push`（回覆推文）/ `edit-push`（編輯推文）
- reply / reply-push 顯示推/→/噓選擇器；edit-push 顯示補充/更正/撤回選擇器
- Backdrop 點擊 / Escape → onClose()
- body 為空時 submit disabled
- 掛載後 textarea 自動 focus，游標移到末尾
- 字數計數器（80 - body.length），< 10 時變紅
- ~~圖片上傳：最多 6 張，顯示縮圖 + 移除按鈕~~（待 Task 3b 改為 Imgur 串接）

---

## Task 3b：Imgur 串接 + Composer 圖片行為修訂

**新增檔案：** `src/lib/imgur.ts`
**修改檔案：** `src/components/Composer.tsx`

### imgur.ts

```
VITE_IMGUR_CLIENT_ID 環境變數（需在 .env.local 設定）

uploadToImgur(file: File): Promise<string>
  POST https://api.imgur.com/3/image
  Headers: Authorization: Client-ID <VITE_IMGUR_CLIENT_ID>
  Body: FormData { image: file }
  回傳 data.link（imgur 短網址，例如 https://i.imgur.com/xxxx.jpg）
  失敗時 throw Error
```

### Composer 圖片行為修訂

原本「最多 6 張，顯示縮圖 + 移除按鈕」改為：

- 點擊圖片按鈕 → 開啟 file picker（accept="image/\*"）
- 選擇圖片後，立即呼叫 `uploadToImgur(file)`
- 上傳中：圖片按鈕顯示 loading 狀態，禁用
- 上傳成功：將 URL 插入 body textarea（游標位置，若無游標則附加到末尾）
- 上傳失敗：顯示錯誤提示（一行文字，例如 "圖片上傳失敗，請重試"）
- 移除 `images: File[]` state 與 payload 欄位（不再需要）
- `ComposerPayload` 移除 `images` 欄位

### 測試重點

- `uploadToImgur` 成功時回傳 link 字串
- `uploadToImgur` 失敗時拋出 Error

---

## Task 4：強化 PushThread

**修改檔案：** `src/components/PushThread.tsx`

### 新增 Props

```
currentUser?: string
onReply?: (push: AggregatedPush) => void
onEdit?: (push: AggregatedPush) => void
pushVotes?: Map<string, { value: -1|0|1; count: VoteCount }>
onVote?: (pushId: string, next: -1|0|1) => void
pushEdits?: Map<string, { content: string; history: { time: string; content: string }[] }>
```

### PushItem 加入 Action Row（type !== "edit" 時顯示）

每個推文卡片底部：

- `VotePair`（顯示該推文的推噓計數 + hover popover，傳入 `push.pushVoters` / `push.booVoters`）
- 「回覆」按鈕 → 呼叫 `onReply(push)`
- 「編輯」按鈕（只有 `push.author === currentUser` 時顯示）→ 呼叫 `onEdit(push)`
- 「編輯歷史」按鈕（該推文有 history 時顯示）→ toggle `EditHistoryPanel`

### EditHistoryPanel（PushThread.tsx 內部元件）

展開後顯示版本時間線：

- 每個版本顯示時間 + 內容
- 最新版本標示 "目前版本" chip
- 第一版標示 "原始" chip
- 有收起按鈕

### 傳遞方式

`PushThread` 從 Map 查找對應 pushId 的 voteState / editData，傳給每個 `PushItem`。

### 測試重點

執行既有 PushThread 測試確認無 regression。

---

## Task 5：強化 Article.tsx

**修改檔案：** `src/components/Article.tsx`

### 新增 Props

```
currentUser?: string
onEditArticle?: () => void   // 導航到修改文章頁
```

### 新增本地 State

```
articleVote: { value: -1|0|1; count: VoteCount }   // 文章推噓（樂觀 UI）
pushVotes: Map<pushId, { value, count }>             // 各推文推噓（樂觀 UI）
myPushVotes: Map<pushId, -1|0|1>                     // 當前使用者對各 push 的投票記錄（dedup 用）
pushEdits: Map<pushId, { content, history }>         // 本地編輯記錄
composer: { mode, initial } | null                   // Composer 開關
```

**投票 dedup 邏輯（在 handlePushVote 中）：**

```
呼叫前先 canVote(myPushVotes.get(pushId) ?? 0, direction)
  → false：直接 return，不送出、不更新 state
  → true：更新 myPushVotes[pushId]，更新 pushVotes counts
```

### Topbar 右側新增按鈕

- 「修改」按鈕：`article.author === currentUser` 且有 `onEditArticle` 時顯示
- 「回文」按鈕：`isLoggedIn` 時顯示（開啟 Composer mode=reply）

### 文章內容下方新增

- `VotePair`（size="lg"）顯示文章推噓計數
- 「回覆此文」按鈕（開啟 Composer mode=reply）

### Composer 控制邏輯

```
openReply()       → composer = { mode: "reply", initial: {} }
openReplyPush(p)  → composer = { mode: "reply-push", initial: { body: "回{p.floorNumber+1}樓：" } }
openEditPush(p)   → composer = { mode: "edit-push", initial: { body: p.content } }

onComposerSubmit(payload):
  if mode=edit-push:
    找到 target push，把舊內容存入 history，更新 pushEdits Map
  // stub：未來替換為 usePttActions 對應呼叫
  setComposer(null)
```

### 傳給 PushThread 的新 props

`currentUser`、`onReply=openReplyPush`、`onEdit=openEditPush`、`pushVotes`、`onVote`、`pushEdits`

### 在 JSX 末尾掛上 Composer Modal

當 `composer !== null` 時渲染 `<Composer ... />`

### 測試重點

執行既有 Article 測試確認無 regression。

---

## Task 6：ComposeScreen 全頁面

**新增檔案：** `src/components/ComposeScreen.tsx`

### 兩種模式

- **post** — 發新文章（可選看板 + 分類）
- **edit-article** — 修改現有文章（看板固定，需填修訂說明）

### Props

```
mode: "post" | "edit-article"
initial?: { board?, category?, title?, body?, images? }
currentUser?: string
onCancel()
onSubmit(payload: { board, category, title, body, editSummary, images })
```

### 版面：兩欄

**左欄（編輯區）：**

- Topbar：取消按鈕、草稿已存時間、預覽切換、發布按鈕（Cmd+Enter 快捷鍵）
- 看板選擇 + 分類 chips
- 標題 input（顯示 "[分類] 標題" 預覽）
- Markdown 工具列（B / I / 刪除線 / 連結 / 引言 / code / 清單 / 插入圖片）
- Body textarea（font-mono）
- 字數 + 閱讀時間
- 圖片列（最多 8 張縮圖，含插入引用按鈕）
- 修訂說明欄（edit-article 模式必填）

**右欄（側欄）：**

- 作者卡（post 模式）或修訂歷史時間線（edit-article 模式）
- 格式提示（Markdown cheatsheet）
- 發文須知

**預覽模式：**

- 切換後左欄改為渲染文章預覽（解析 inline markdown：\*\*bold\*\*、\_italic\_、\`code\`、https://url）
- 圖片引用 `![alt](alt)` 顯示實際圖片

### 其他行為

- 標題或內文改動後 600ms 顯示「草稿已存於 HH:mm」
- Escape 鍵 → `onCancel()`
- submit 條件：標題非空 + 內文非空 + (edit-article 時修訂說明非空)
- 圖片上傳：點工具列「插入圖片」按鈕或縮圖列「+ 加入圖片」→ file picker → 呼叫 `uploadToImgur(file)` → 上傳成功後將 URL 插入 body 游標位置；上傳中顯示 loading，失敗顯示錯誤提示

### 測試重點

建立後執行 `npm run build` 確認 TypeScript 無錯誤。

---

## Task 7：App.tsx 路由擴充

**修改檔案：** `src/App.tsx`、`src/lib/ptt/viewState.ts`、`src/components/ArticleList.tsx`

### viewState.ts：AppView 新增兩個 case

```
| { type: "compose"; board: string }
| { type: "compose-edit"; board: string; articleIndex: number }
```

### App.tsx 新增

- 從 `usePttSocketStore` 取 `credentials.username` 作為 `currentUser`
- 路由 `compose` → 渲染 `<ComposeScreen mode="post" .../>`
- 路由 `compose-edit` → 渲染 `<ComposeScreen mode="edit-article" .../>`
- 傳 `currentUser` 給 `<Article>`
- 傳 `onEditArticle` 給 `<Article>`（導航到 compose-edit）

### ArticleList.tsx

- 新增 `onCompose?: () => void` prop
- `pttState === "ready"` 且有 `onCompose` 時，在工具列右側顯示「發新文章」按鈕

### 驗收

```
npm run build   // TypeScript 0 errors
npm run test    // 全部通過
```

---

## ✅ Bug Fix：修正 Zustand selector 導致連續載入問題

**修改檔案：** `src/hooks/useBoard.ts`、`src/hooks/useArticle.ts`

### 問題
在打開看板（例如 Gossiping）時，文章列表會出現「一直跳動載入」現象，loading 狀態不斷切換。

### 根因
`useBoard` 和 `useArticle` 使用 `usePttSocketStore()` 直接取得整個 store state，而非使用 selector。
這導致當 store 的任何部分變化（例如 wsStatus、loginError、recentBuffer 等）時，hooks 都會重新渲染，
進而觸發 effects 重新執行，導致 fetch 不斷被重啟。

### 修正
改用 Zustand selector 只訂閱需要的值，避免不必要的 effect 重新執行。

---

## ✅ Design Decision：優先投票檢測，禁止聚合

**相關檔案：** `src/lib/ppt/pushAggregator.ts`
**文件化位置：** `dev-notes/reply-handling-rule.md`

### 問題
當推文被識別為投票操作（如「推0樓」）時，聚合規則仍會嘗試與下一推合併，造成：
- 投票操作語義遺失（獨立的推噓行為混入敘述內容）
- 與嵌套回覆檢測衝突

### 解決方案
在分群階段優先檢測投票，投票推文獨立成群，不聚合。

### 邏輯調整
1. **分群時** — 投票推優先識別，獨立成群
2. **聚合時** — 不與投票推合併內容
3. **去重時** — 同作者先推後噓 → 最終算噓（已支援）

---

## 尚未涵蓋（後續任務）

- **PTT adapter 真實寫入整合** — `usePttActions` stub → 實際呼叫 `adapter.send()` 序列
- **文章刪除功能**（spec §8）

---

## Feature Refining：Goal 7 UI / PTT 實際資料對齊

### Refining A：首頁熱門看板改用 PTT 實際 hot board 資料

**修改檔案：**

- `src/components/BoardInput.tsx`
- `src/hooks/usePttSocket.ts`
- `src/lib/ptt/adapter.ts`
- `src/App.tsx`

**目標：**
首頁熱門看板不應顯示硬編碼假在線人數，例如 `28,420`、`12,880`。需改用 PTT 實際熱門看板清單與目前人氣數。

**實作方向：**

- `PttAdapter` 新增 `listHotBoards(): Promise<HotBoardSummary[]>`
- 使用 `ptt-client` 的 `Board.select(bot).where("entry", "hot").get()` 取得 hot board list
- `useHotBoards()` 在 `pttState === "ready"` 後載入資料
- `BoardInput` 支援 `popularBoards` / `popularBoardsLoading`
- 有 live data 時顯示「熱門看板」與 `users`；沒有 live data 時只顯示「常用看板」與「即時人數待同步」，不再顯示假數值

**驗收：**

- 無 live data 時不能出現任何硬編碼假在線數
- 有 live data 時顯示 adapter 回傳的 `name/title/users`
- Preview 模式不主動查 hot boards

---

### Refining B：發文分類改以實際 PTT 發文提示為準

**修改檔案：**

- `src/lib/ptt/boardCategories.ts`
- `src/lib/ptt/adapter.ts`
- `src/App.tsx`
- `src/components/ComposeScreen.tsx`

**目標：**
發文分類不能只依賴固定 map：

```typescript
{
  gossiping: ["問卦", "新聞", ...],
  stock: ["標的", "新聞", ...],
}
```

因為不在 map 內的看板仍可能有自己的發文類別規則。應優先讀取實際 PTT 發文頁提示。

**實作方向：**

- 移除硬編碼 board category fallback
- `boardCategories.ts` 只負責 normalize 外部傳入的分類，不自行發明分類
- `PttAdapter` 新增 `getPostCategoryOptions(boardName): Promise<string[]>`
- adapter 流程：
  1. 確認已登入
  2. 進入指定看板
  3. 送 `Ctrl-P` 進入 PTT 發文提示
  4. 從終端畫面解析分類選項
  5. 送 `Ctrl-C` 取消，避免任何發文行為
- `App.tsx` 在進入 compose view 後查詢該看板實際發文分類，並 cache per board
- `ComposeScreen` 使用實際分類 chips；若抓不到提示或該看板沒有分類提示，才顯示手動分類輸入

**驗收：**

- `resolveBoardCategoryOptions("Gossiping")` 不再回傳硬編碼分類
- 可從模擬 PTT 發文提示畫面解析 `["問題", "情報", "心得", "閒聊"]`
- 不執行發文、回文、編輯或送出內容

---

## 發文流程 Pseudo Code

### 高層次流程（UI → adapter）

```
使用者流程：
  1. 點擊「發新文章」
     → App navigate to "compose" view
     → ComposeScreen(mode="post") 渲染
     
  2. 選擇看板 + 分類（分類透過 getPostCategoryOptions 取得）
     → 先發 request: adapter.getPostCategoryOptions(boardName)
     → categories 回傳後，UI 展示 chips
     
  3. 輸入標題、內容、上傳圖片（Imgur）
     → 草稿自動存到 localStorage (600ms debounce)
     
  4. 點發布
     → onSubmit(payload)
     → usePttActions.postArticle(board, category, title, body)
     → 實際調用 adapter.postArticle(board, category, title, body)
```

### 設計原則（基於初版審視結論）

下列原則是審視 v1 pseudo code 後的修訂結果，所有後續實作都應遵守：

1. **分類選擇後不可重複加 `[分類]` 前綴** — PTT 在使用者按下分類編號後，會自動把 `[分類]` 加上空白預填到標題輸入區。我們只送純標題本體 `${title}`。
2. **儲存流程是多階段的** — 按 Ctrl+X 之後依序會碰到：
   - 「您是否要儲存檔案 [Y/n]?」
   - （部分情境）「文章是否符合分類規定 [Y/n]?」
   - 「請選擇簽名檔 (0-9, x.不選)」
   - 「文章發表成功！按任意鍵繼續」
   每一階段都需要主動偵測並回應，不能省略。
3. **以輪詢 (polling) 取代固定 sleep** — PTT WebSocket RTT 變動大，固定 `sleep(N)` 在高延遲下會錯過提示、低延遲下浪費時間。每次按鍵後都應 `while (!匹配預期狀態 && !timeout) await sleep(80)`。
4. **內文要 sanitize control char 並逐行送出** — 移除 `\x00-\x1F`（除了 `\n`/`\t`），長文逐行送 `${line}\r`，每行間隔 20–50ms 讓編輯器跟上。
5. **嚴格驗證畫面狀態** — 用 `extractCurrentBoardName()` / `isBoardListScreen()` 驗證返回看板，不要僅 `screen.includes(boardName)`。

---

### adapter.postArticle 完整流程（v2 修訂版）

```typescript
async postArticle(board, category, title, body) {
  // Phase 1: 準備階段
  檢查登入狀態：
    if (!isLoggedIn()) throw Error("未登入")

  序列化任務：
    return runSerial(async () => {
      // Phase 2: 確保乾淨進入看板
      // 若目前在編輯頁，先 Ctrl+C 退出（最多嘗試 2 次，每次後驗證）
      若處於編輯狀態：
        await bot.send("\x03")  // Ctrl+C
        await waitFor(/任意鍵/, 1000) || await sleep(300)
        await bot.send("\r")  // 清掉「按任意鍵」

      success = ensureNormalBoardView(bot, board)
      if (!success) throw Error(`無法進入看板 ${board}`)

      // Phase 3: 開啟發文提示
      await bot.send("\x10")  // Ctrl+P
      // 輪詢直到出現分類提示（含「分類」「類別」「種類」字樣或方括號選項）
      ok = await waitForScreen(/分類|類別|種類|\[[^\]]{1,12}\]/u, 1500)
      if (!ok) {
        await bot.send("\x03")  // 退出
        throw Error("無法開啟發文視窗（可能無發文權限）")
      }

      // Phase 4: 解析並選擇分類
      screen = readVisibleScreen(bot)
      options = parsePostCategoryOptions(screen)
      selectedIndex = options.findIndex(o => o === category)

      if (selectedIndex >= 0) {
        await bot.send(String(selectedIndex + 1))
        // 等待標題輸入區出現（會看到 "標題：" 字樣 + 預填 [分類] 前綴）
        await waitForScreen(/標題[:：]/u, 1500)
      } else if (category) {
        // 分類不在列表但呼叫端指定了分類 → 視為錯誤
        await bot.send("\x03")
        throw Error(`分類 "${category}" 不在可用清單：[${options.join(", ")}]`)
      } else {
        // 沒指定分類，且看板不強制 → 按 Enter 跳過
        // ⚠️ 部分看板（如 Gossiping）強制分類，按 Enter 會跳錯誤訊息
        await bot.send("\r")
        const ok = await waitForScreen(/標題[:：]/u, 1500)
        if (!ok) {
          screen = readVisibleScreen(bot)
          await bot.send("\x03")
          throw Error("此看板強制要求分類，請傳入有效 category")
        }
      }

      // Phase 5: 輸入標題（純本體，不加 [分類]）
      // 重要：選分類後 PTT 已預填 [分類] 前綴；只送 title 本體即可
      cleanTitle = title.trim().replace(/[\x00-\x1F]/g, "").slice(0, 60)
      if (!cleanTitle) {
        await bot.send("\x03")
        throw Error("標題不可為空")
      }
      await bot.send(`${cleanTitle}\r`)
      // 標題完成後會進入內文編輯器（pmore 風格畫面）
      await waitForScreen(/離開\s*\[Ctrl-X\]|插入模式|文章編輯/u, 2500)

      // Phase 6: 逐行輸入內容（避免長文截斷）
      lines = sanitizeBody(body).split("\n")
      for (const line of lines) {
        await bot.send(`${line}\r`)
        await sleep(30)  // 讓編輯器處理插入
      }

      // Phase 7: Ctrl+X 進入儲存對話流程
      await bot.send("\x18")  // Ctrl+X

      // Phase 8: 多階段儲存對話
      saveOk = await handleSaveDialog(bot)
      if (!saveOk) return { ok: false, reason: "save-dialog" }

      // Phase 9: 處理簽名檔提示
      sigOk = await handleSignaturePrompt(bot)  // 送 "0" 不附簽名檔
      if (!sigOk) return { ok: false, reason: "signature" }

      // Phase 10: 等待「按任意鍵繼續」並返回看板
      await waitForScreen(/任意鍵|已送出|發表成功/u, 5000)
      await bot.send("\r")
      await sleep(300)

      // Phase 11: 驗證已回到看板列表
      ok = await ensureNormalBoardView(bot, board)
      return { ok }
    })
}

// 多階段儲存對話處理
async function handleSaveDialog(bot) {
  const start = Date.now()
  let answeredSave = false

  while (Date.now() - start < 5000) {
    screen = stripAnsi(readVisibleScreen(bot))

    // 第一道：儲存確認（[Y/n]）
    if (!answeredSave && /要儲存|是否儲存|存檔|\[Y\/n\]/iu.test(screen)) {
      await bot.send("y\r")
      answeredSave = true
      await sleep(120)
      continue
    }

    // 第二道：分類規定確認（部分看板才有）
    if (/符合分類|分類規定/u.test(screen)) {
      await bot.send("y\r")
      await sleep(120)
      continue
    }

    // 第三道：簽名檔提示出現 → 把控制權交給下一階段
    if (/簽名檔|signature/iu.test(screen)) {
      return true
    }

    // 第四道：直接看到「已送出 / 任意鍵」也算成功
    if (/已送出|發表成功|任意鍵/u.test(screen)) {
      return true
    }

    await sleep(80)
  }
  return false
}

// 簽名檔處理
async function handleSignaturePrompt(bot) {
  screen = stripAnsi(readVisibleScreen(bot))
  if (!/簽名檔|signature/iu.test(screen)) {
    return true  // 沒提示就直接通過
  }

  // 0 = 不要簽名檔；x = 不選（兩者都會跳過）
  await bot.send("0\r")
  return await waitForScreen(/已送出|發表成功|任意鍵/u, 3000)
}

// 內容 sanitize：移除 control char、normalize line endings、限長
function sanitizeBody(body) {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")  // 保留 \n, \t
    .slice(0, 50000)  // 上限保險
}
```

### getPostCategoryOptions 完整流程（v2 修訂版）

```typescript
async getPostCategoryOptions(boardName) {
  return runSerial(async () => {
    // Phase 1: 準備
    if (!isLoggedIn()) throw Error("未登入")

    // Phase 2: 進入看板
    success = await ensureNormalBoardView(bot, boardName)
    if (!success) throw Error(`無法進入看板 ${boardName}`)

    // Phase 3: 打開發文提示
    await bot.send("\x10")  // Ctrl+P

    // Phase 4: 輪詢直到分類提示出現或 timeout
    options = []
    const start = Date.now()
    while (Date.now() - start < 1500) {
      screen = readVisibleScreen(bot)
      options = parsePostCategoryOptions(screen)
      if (options.length > 0) break
      // 也可能是「無分類」直接到標題輸入
      if (/標題[:：]/u.test(stripAnsi(screen))) break
      await sleep(80)
    }

    // Phase 5: 取消發文（Ctrl+C）
    await bot.send("\x03")
    await sleep(150)

    // 部分情境 Ctrl+C 會問「確定放棄？[Y/n]」，需再回 y
    screen = stripAnsi(readVisibleScreen(bot))
    if (/放棄|取消編輯|是否離開/u.test(screen)) {
      await bot.send("y\r")
      await sleep(200)
    }

    // Phase 6: 嚴格驗證已返回看板
    // 用 extractCurrentBoardName 比對，避免 boardName 在頁尾誤判
    current = extractCurrentBoardName(stripAnsi(readVisibleScreen(bot)))
    if (current?.toLowerCase() !== boardName.toLowerCase()) {
      // 嘗試重新進入看板恢復狀態
      await ensureNormalBoardView(bot, boardName)
    }

    return options
  })
}
```

### 畫面解析：parsePostCategoryOptions 邏輯

```typescript
function parsePostCategoryOptions(screen) {
  const lines = screen.split('\n')
  
  // 尋找分類行（包含「分類」「類別」「種類」「標題」）
  const categoryKeyword = /分類|類別|種類|標題/u
  const categoryLine = lines.find(line => categoryKeyword.test(line))
  
  if (!categoryLine) return []
  
  // 從該行抽取所有 [內容] 格式的選項
  // 正則：\[([^\]\n]{1,12})\]
  const matches = categoryLine.match(/\[([^\]\n]{1,12})\]/gu) || []
  
  return matches
    .map(m => m.slice(1, -1))  // 移除括號
    .filter(opt => !isCommonKeyword(opt))  // 過濾「無」「其他」等
}

function isCommonKeyword(text) {
  const common = ["無", "其他", "不分類", "待分類"]
  return common.includes(text)
}
```

### 錯誤處理與重試策略

```typescript
// submitPostFromBot 失敗時的診斷邏輯

async submitPostFromBot(...) {
  try {
    // 主流程
    ...
  } catch (err) {
    // 診斷失敗原因
    const screen = readVisibleScreen(bot)
    
    if (screen.includes("無此看板") || screen.includes("此看板不存在")) {
      throw new Error(`看板不存在：${board}`)
    }
    
    if (screen.includes("您無權進入")) {
      throw new Error(`無權進入看板：${board}`)
    }
    
    if (screen.includes("無法儲存")) {
      throw new Error("文章儲存失敗，可能內容過長或格式錯誤")
    }
    
    if (screen.includes("標題過短") || screen.includes("標題過長")) {
      throw new Error("標題長度不符")
    }
    
    // 通用錯誤
    throw new Error(`發文失敗（屏幕內容：${screen.substring(0, 100)}）`)
  }
}
```

### UI → 後端的呼叫順序（時序圖）

```text
使用者選擇看板 "Gossiping"
  │
  ├─ ComposeScreen onMount
  │  └─ useEffect: 呼叫 getPostCategoryOptions("Gossiping")
  │     │
  │     └─ adapter.getPostCategoryOptions("Gossiping")
  │        │
  │        ├─ ensureNormalBoardView(bot, "Gossiping")
  │        ├─ send(Ctrl+P) → read screen → parsePostCategoryOptions
  │        ├─ send(Ctrl+C) 取消
  │        └─ return ["問卦", "新聞", "心得", "閒聊"]
  │
  └─ UI 更新：分類 chips = 上述清單
     │
     使用者輸入標題、內容
     │
     使用者點「發布」
     │
     └─ onSubmit({ board, category, title, body })
        │
        └─ usePttActions.postArticle(...)
           │
           └─ adapter.postArticle(board, category, title, body)
              │
              ├─ ensureNormalBoardView → send(Ctrl+P)
              ├─ 讀屏幕 → 選分類 → 輸標題 → 輸內容
              ├─ send(Ctrl+X) → 確認 "是否確定送出"
              ├─ send("y\r") → 確認按任意鍵
              ├─ send("\r")
              └─ ensureNormalBoardView 返回看板
                 │
                 return { ok: true }
```

---

### Refining C：目前驗證指令

本輪 refining 完成後需維持：

```bash
npm run build
npm run test
```

目前最新驗證結果：

- `npm run build` 通過
- `npm run test` 通過：19 files / 218 tests
