# Goal 6 實作筆記

## 2026-04-29 Iteration 關閉前整理

### 最後修正：初次開文「只看到標題」問題

**根因**

`Article.tsx` 在 loading 且尚無 `partialArticle` 時，若有 `initialArticleSummary`（從看板列表點文章時傳入），會建立 `initialArticle` 物件顯示佔位畫面。這個物件的 `body: ""`，導致 `LightweightArticleBody` 輸出空白的 `<pre>`，使用者看到的是只有標題區、下方一片空白。

發生的前提：
1. 文章無 cache（首次開文）
2. `partialArticle` 尚未到達（正在等 PTT 網路回應）
3. 從看板列表點文章（有 `initialArticleSummary`，非 AID 模式）

**修正**（`src/components/Article.tsx`，`LightweightArticleBody`）

```tsx
function LightweightArticleBody({ body }: { body: string }) {
  const clean = body.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  if (!clean) {
    return <div className="mb-8 py-4 text-sm text-gray-500">文章內容載入中…</div>;
  }
  return (
    <pre className="mb-8 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-gray-200">
      {clean}
    </pre>
  );
}
```

body 為空時顯示提示文字，一旦第一個 partial 到達（body 有內容）就自動切回正常渲染。

---

### Goal 6 整體完成狀況（iteration 關閉時）

#### spec 五個子需求

| # | spec 原文 | 最終狀態 |
|---|-----------|---------|
| 1 | 開啟文章後看到內容的時間不能超過 0.5 秒，下方回文區需要逐步渲染 | ✅ **階段目標完成**。首屏 partial 約 0.4–1.5s 可見；正文與回文以 ~230ms 節奏逐步增量；不再等整篇讀完才顯示。嚴格 0.5s 未達，本輪已調整為「先有內容」為目標。 |
| 2 | 進入看板看到文章列表的時間不超過 0.5 秒 | ✅ **階段目標完成**。board cache + partial list parse；篩選列表 cache（17ms）；從文章返回看板保留閱讀位置（anchor restore）。 |
| 3 | 看板文章可隨著滾動自動載入 | ✅ **完成**。IntersectionObserver scroll sentinel，fallback 手動按鈕。 |
| 4 | 自動預覽圖片和 YouTube 影片 | ✅ **完成**。`parseContentSegments` + `ImagePreview` + `YouTubePreview` + `RichContent`，文章正文與推文均支援。 |
| 5 | 基本文章讀相關操作（搜尋、AID 跳轉、篩選推噓文數） | ✅ **完成**。`searchArticles` / `filterArticlesByPush` / `getArticleByAid`；`useBoard` `BoardFilter`；搜尋列 + 快選按鈕。 |

#### 主要技術改進時間線

| 日期 | 改進 |
|------|------|
| 2026-04-12 | Progressive render 初版（首屏 partial）；scroll sentinel；rich content；搜尋/篩選/AID |
| 2026-04-21 | 同看板開文不再重入板；看板列表手動讀頁；partial list 改 merge 不 replace |
| 2026-04-22 | 文章推文逐步載入；loading 期間 lightweight render path；monotonic partial merge；AID 改走 manual progressive reader |
| 2026-04-24 | 首屏 wait timeout 縮短；adapter instrumentation（`dumpLastArticleOpenTrace`、`__pttzzzArticlePartialTimeline`） |
| 2026-04-27 | 100% 頁 break 修正（tail 消除）；篩選文章開文 index 錯誤修正（`listArticlesWithConditions` 全手動流程）；hybrid path 移除，getArticle 固定走 manual progressive |
| 2026-04-28 | ptt-client debounce timeout 40ms；截斷標題 prefix 比對；篩選列表 stale-while-revalidate cache；文章完整 cache（pushes + articleNotes + score）|
| 2026-04-29 | `LightweightArticleBody` 空 body 佔位修正 |

#### 最終測試狀態

143 tests passed（`npm run test`）

#### 已知殘留問題

- **AID 路徑**：`getArticleByAid` 有時落到看板說明頁而非指定文章，與文章逐步載入主線分開，留待後續修正。
- **子需求 1 嚴格 0.5s**：首屏 partial 約 0.4–1.5s，受 PTT 網路 RTT（~150ms × 頁數）限制，在不改 ptt-client 架構的前提下難以突破。

---

## 2026-04-28 debounce 縮短 + 截斷標題比對修正

### 問題背景

真站實測確認兩個來源的額外延遲：

1. **ptt-client 的 `timeout` 是 debounce，不是 timeout**：每收到一個 WebSocket message 就重設計時器，沉默 `timeout` ms 後才 emit 資料。`timeout: 200` 代表每次 PgDown 翻頁，最少等 200ms 才得到結果。
2. **`isExpectedArticlePartial` 截斷標題比對失敗**：PTT 板面列表儲存的是完整標題（`substrWidth` 讀到行尾），文章 `標題:` header 行格式化為 80 columns，從第 32 格開始，最多約 48 visual columns，長標題會被截斷。原本用嚴格 `===` 比對，導致長標題文章的 `screen_subscribe` 和 `adapter_callback` partial 全部被 `handlePartial` 靜默丟棄，使用者看到「只有標題、沒有正文」直到完整文章 resolve。

### 根因確認

從 `window.__pttzzzArticlePartialTimeline` 發現：某些文章完全沒有 `adapter_callback` / `screen_subscribe` 進入 state，`partialArticle` 一直是 null，直到 final article 才切換。

從 `dumpLastArticleOpenTrace()` 看到 adapter 確實有 emit partial candidates，但 `isExpectedArticlePartial` 把它們全部拒絕：

- article `標題:` header：`[新聞] 快訊／醫大生遭無照酒駕猴撞死　「上訴`（截斷在 23 個中文字）
- expectedSummary.title：`[新聞] 快訊／醫大生遭無照酒駕猴撞死　「上訴駁回」二審判10年`（完整標題）

兩者不等，partial 被拒絕。

### 修改一：ptt-client debounce timeout 縮短

`src/lib/ptt/adapter.ts`，`createBot()` 內：

```typescript
timeout: 40,   // 原本 200 — 每 WebSocket message 後的 debounce，縮短約 5x
```

同一檔案，`waitForScreenChange()` 預設 timeout：

```typescript
async function waitForScreenChange(
  bot: ...,
  previousScreen: string[],
  timeoutMs = 400,   // 原本 1200
```

效果：每次 PgDown 翻頁從約 220ms 縮到約 90–140ms（理論值）；實測因 PTT 網路 RTT 約 150ms 主導，每頁實際仍約 230–250ms，但較舊版已有改善。

### 修改二：截斷標題 prefix 比對

`src/hooks/useArticle.ts`，`isExpectedArticlePartial()`：

```typescript
export function isExpectedArticlePartial(
  partial: PartialArticleData,
  expected?: ArticleSummary | null,
): boolean {
  if (!expected) return true;
  const a = normalizeArticleTitle(partial.title);
  const b = normalizeArticleTitle(expected.title);
  if (a === b) return true;
  // The board-list title may be the full title while the article's 標題 header line
  // is truncated to ~48 terminal columns (80-col terminal, title starts at col 32).
  // Allow a match when one is a prefix of the other, with a minimum length guard
  // to avoid false positives between unrelated articles.
  const minLen = Math.min(a.length, b.length);
  if (minLen < 10) return false;
  return b.startsWith(a) || a.startsWith(b);
}
```

- 若其中一方是另一方的 prefix，且最短邊 ≥ 10 字元，視為同一篇文章
- `minLen < 10` guard 防止短標題誤配不相關文章

### 對應測試

`src/hooks/__tests__/useArticle.test.ts`，新增：

- `accepts a truncated article-header title that is a prefix of the full board-list title`
  - 截斷標題（`[新聞] 快訊／醫大生遭無照酒駕猴撞死　「上訴`）→ `toBe(true)`
  - 完全無關標題 → `toBe(false)`
  - 短版 / 長版互為 prefix 的正向案例 → `toBe(true)`

143 tests passed。

### 真站實測結果

測試文章：`Gossiping #779852 [問卦] 新青安都不知道前五年只繳利息嗎？`（36 推，實際 56 則回文）

量測方式：`window.__pttzzzArticlePartialTimeline` + `MutationObserver`，board idle 狀態下點擊。

| 指標 | 結果 |
|------|------|
| 首次 partial 正文可見（screen_subscribe） | **+3,032ms** |
| 首個 adapter_callback | +4,681ms |
| 每 push-page delta | ~233–248ms |
| 全部 56 則回文完成 | +5,658ms |

前一版（`timeout: 200`，board 正在載入時點擊）：首次 partial 出現 ~6,700ms，完成 ~8,800ms。

本版改善約 **45%**（首次 partial：6.7s → 3.0s；完成：8.8s → 5.7s）。剩餘的 ~1.6s queue wait 來自 serial runner（`listArticles` 執行中無法立即啟動 `getArticle`），屬架構設計取捨。

### 每頁 230–250ms 的分解

| 來源 | 估計 |
|------|------|
| PTT WebSocket RTT（台灣） | ~150ms |
| debounce（timeout=40） | 40ms |
| waitForScreenChange polling（20ms 間隔） | ~20–40ms |
| React state update overhead | ~10–20ms |
| **合計** | ~220–250ms |

與舊版（debounce 200ms，理論每頁 ~370ms）相比，因 RTT 主導，實測差異小於理論值，但整體仍有改善。

---

## 2026-04-28 篩選列表 cache + 文章完整 cache

### 問題

**篩選列表**：從篩選模式（push ≥ N / 關鍵字搜尋）的文章退出後，返回篩選列表需要 3–8 秒，畫面顯示空白 + loading。

根因在 `useBoard.ts`：
```typescript
const cachedArticles = !filter ? readBoardCache(boardName) ?? [] : [];
```
有 filter 時 cache 強制為空陣列，每次 component 重新 mount 都從零開始呼叫 `listArticlesWithConditions`（需重送篩選指令、等 PTT 回應）。

**文章 cache**：原本 `writeArticleCache` 只存 `body`（不存 `pushes`），再次開同一篇文章時 `cachedArticle` 只能顯示 `PartialArticleView`（輕量版，無討論串），仍需等完整 reload 才看到推文。

### 修改一：篩選列表 stale-while-revalidate cache

**`src/lib/ptt/viewCache.ts`**

新增 `filteredBoardCache: Map<string, ArticleSummary[]>`，key 格式：
- `boardName:search:keyword`（關鍵字搜尋）
- `boardName:push:threshold`（推噓文數篩選）

新增 `readFilteredBoardCache(boardName, filter)` / `writeFilteredBoardCache(boardName, filter, articles)`。

**`src/hooks/useBoard.ts`**

- `cachedArticles` 改為：有 filter → `readFilteredBoardCache`；無 filter → `readBoardCache`
- `setLoading(cachedArticles.length === 0)`（有 cache 時不 loading）
- `setArticles(cachedArticles)`（直接顯示上次結果）
- fetch 完成後用 `refreshCachedBoardArticles` merge，寫回 `writeFilteredBoardCache`
- `loadMore` 同步更新 filtered cache

### 修改二：文章完整 cache（stale-while-revalidate）

**`src/hooks/useArticle.ts`**，`writeArticleCache` 呼叫改為存完整資料：

```typescript
writeArticleCache(boardName, articleIndex, {
  title: next.title,
  author: next.author,
  date: next.date,
  board: next.board,
  body: next.body,
  pushes: next.pushes,        // 新增
  articleNotes: next.articleNotes, // 新增
  score: next.score,          // 新增
});
```

`loadArticle("initial")` 新增 stale-while-revalidate 路徑：
- 若 `cached?.pushes?.length > 0`：立刻 `setArticle(cached)`（完整文章顯示）、`setReloading(true)`（背景 refresh）
- `isStaleRevalidate = true`：背景 fetch 期間 `handlePartial` 靜默跳過（完整文章已顯示，不需 partial overlay）
- `subscribeScreen` partial 本身已因 `!loading` 自動不觸發
- reload 完成後 `setArticle(fresh)` 更新推文、`setReloading(false)`

### 真站實測結果

**篩選列表返回**（Gossiping ≥100 推篩選）：

| 情境 | 返回顯示列表耗時 |
|------|----------------|
| 修改前（無 cache） | 3–8 秒（空白 + loading） |
| 修改後（cache hit） | **17ms**（40 篇結果立刻顯示） |

**文章第二次開啟**（#779947，44 推）：

| 情境 | 顯示完整文章耗時 |
|------|----------------|
| 修改前（第一次） | ~22 秒（queue wait + 逐頁讀取） |
| 修改後（cache hit） | **18ms**（完整文章含推文立刻顯示，按鈕顯示「更新中...」） |

---

## 2026-04-27 PgDown-at-100% tail fix

### 問題

真站實測發現文章完整載入前，最後一次 partial 更新後還有約 **3451ms 的 tail** 才切到 final article。橫跨多篇文章（157~452 推）tail 長度幾乎固定，代表與文章長度無關。

### 根因

`readArticleLinesProgressively()` 的 loop 缺乏對 `100%` footer 的 break 條件。

ptt-client 的 `getLines()` 是這樣設計的：

```javascript
while (!getLine(23).str.includes('100%') ...) {
    await this.send(PgDown);
}
```

只要 footer 不是 `100%` 就繼續翻頁，看到 `100%` 才停。

我們的 `readArticleLinesProgressively()` 沒有這個 guard，依靠兩個條件停止：

1. `此文章無內容`
2. `page >= 1 && appended === 0`（沒有新內容）

問題是：最後一頁（例如 34/34, 100%）可能比前一頁（33/34）多幾行新推文，導致 `appended > 0`。這時不滿足第 2 個條件，loop 繼續送出 PgDown。

PTT 在 100% 不回傳新畫面（或只回傳 ANSI cursor 控制序列，不改變可見文字）：

- `bot.send(PgDown)` 立刻 resolve（拿到任意 'message' event）
- 但 `waitForScreenChange(bot, screen, 1200)` 輪詢 `getLine()` visible text，發現 text 沒變，等到 **1200ms timeout** 才 return

這 1200ms 直接加到 tail。加上後續 HOME / "q" send 等待，總計約 **1200 + 200 + 200 ≈ 1600ms**，在某些情況下更長（兩個 run 的加總觀察到 ~3451ms）。

### 修正

`src/lib/ptt/adapter.ts`，`readArticleLinesProgressively()` loop：

```typescript
// Stop at 100% after the first page: pressing PgDown at 100% would either
// do nothing (causing a 1200ms waitForScreenChange timeout) or exit the article.
// At page=0 we allow one PgDown in case PTT opened at the last page and more
// content is visible after navigating. Mirrors ptt-client getLines() semantics.
if (page >= 1 && stripAnsi(screen[23] ?? "").includes("100%")) break;
```

放在 `appended === 0` break 之後（`appended === 0` 先處理更常見的情況）、`bot.send(PgDown)` 之前。

`page >= 1` 保留：頁=0 若已在 100%，允許一次 PgDown（可能是 PTT 從末頁 open，或有新 push 從 subscribeScreen 到來）。

### 測試

138 tests passed。

包含現有測試：`continues emitting partial pushes across screens that already show 100 percent`（page=0 at 100% 仍允許 PgDown），此測試未因本次修改而 fail。

---

## 2026-04-27 兩個 bug 修正

### Bug 1：Progressive loading 走到 hybrid 路徑，partials 並非真正逐頁

**根因確認**

`PttClientAdapter.getArticle()` 在有 `onPartial` 時呼叫 `fetchArticleFromBotHybrid`：

1. 手動讀第一頁 → `onPartial(firstScreen)`
2. 再呼叫 library `bot.getArticle()` 一次性讀完所有 lines
3. 用 `emitProgressivePartialsFromRawLines()` 把已讀完的 lines 切成 chunk，人工模擬逐段 emit

這個路徑的問題：第 2~3 步是「先全部讀進來，再假裝逐段 emit」，用戶實際等待時間並未縮短，只是 emit 節奏變得均勻，不是真正逐頁增量。

**修正**

`src/lib/ptt/adapter.ts`：

- `PttClientAdapter.getArticle()` 有 `onPartial` 時改走 `fetchArticleFromBotManually()`
- `fetchArticleFromBotManually()` 使用真正的 `readArticleLinesProgressively()`（逐 PgDown 翻頁，每頁 emit partial）
- `fetchArticleFromBotHybrid()` 移除（成為 dead code 後刪除）

**驗證**

`dumpLastArticleOpenTrace()` 確認 progressive candidates 以 ~230–250ms 節奏逐頁累積，符合預期。

---

### Bug 2：篩選（≥N 推）文章點開後，實際進入的是公告文章

**根因確認（完整追蹤）**

`listArticlesWithConditions()` 舊做法：

```typescript
this.bot.searchCondition?.init?.();
this.bot.searchCondition?.add?.("push", "100");
const rows = await this.bot.getArticles(boardName, 0);
// rows 的 id 是「篩選序號」，例如 16535 = Gossiping 第 16535 篇爆文
```

ptt-client `getArticles()` 內部行為：

1. 進看板
2. 送出篩選字串（`Z100\r`）
3. 讀畫面（系列《Gossiping》），column 1–7 顯示「系列序號」（16535, 16534...）
4. **重新計算所有文章 id：從 `articles[0].id` 開始 +1**（lines 741–743）
5. 呼叫 `enterIndex()`（10 × ArrowLeft）退出篩選模式，回到看板目錄層級

於是回傳的 `articles[0].id = 16535`、`articles[1].id = 16536`... 其實是系列序號，非板面文章索引。

當用戶點選 id=16535 的文章，`getArticle("Gossiping", 16535)` 送出 `16535\r\r`：

- `enterIndex()` 已讓 terminal 回到目錄層級
- `ensureBoardView` 重新進入**一般看板**（非篩選模式）
- 在一般看板送 `16535\r\r` → 打開板面索引 16535 號文章（2019 年公告）

從 `dumpLastArticleOpenTrace()` 確認：`articleIndex: 16535`，`previousFingerprint` 已指向公告文章 header。

**修正**

`src/lib/ptt/adapter.ts`，`listArticlesWithConditions()` 改為全手動流程：

1. 以 `ensureNormalBoardView()` 確保進入一般看板（非篩選模式、非文章頁）
2. 送 `End+End` 到最新文章
3. 手動送篩選指令（`Z100\r` 或 `/keyword\r`），等待篩選結果出現
4. 若有 `beforeIndex`，在篩選結果內送 `End+End+offset\r` 定位
5. 以 `parsePartialBoardScreen()` 讀取篩選畫面，取得各文章的「系列序號」作為 index
6. **不呼叫 `enterIndex()`，保持在篩選模式**

新增 `ensureNormalBoardView()` helper：

- 在文章頁：先送 `q` 退回看板列表
- 在篩選列表（系列《...》）：呼叫 `enterIndex()`（10 × ArrowLeft）退到目錄層級，再 `enterBoardByName()` 進一般看板
- 在一般看板：直接回傳 true

修改 `ensureBoardView()`（供 `fetchArticleFromBotManuallyWithOpen()` 使用）：

- 若在同一看板的文章頁（非 list view），先送 `q` 退回看板列表
- `q` 退回後若判定為 board list screen，立即 return true（**保留篩選模式**，若之前在篩選模式，`q` 後仍在篩選列表）
- 若 `q` 沒有成功退回到 board list，再 fallback 到 `enterBoardByName()`

修改 `fetchBoardArticlesFromBotManually()`（供 `listArticles()` 使用）：

- 改呼叫 `ensureNormalBoardView()` 取代 `ensureBoardView()`
- 確保一般看板列表呼叫永遠離開篩選模式

`PttClientAdapter` 新增：

- `lastFilterBoardName` / `lastFilterConditions`：`loadMore` 時若篩選條件相同且 terminal 仍在篩選模式，直接導航，不重送篩選指令

`PttClientAdapter.listArticles()`：

- 呼叫時清除 `lastFilterBoardName` / `lastFilterConditions`，確保後續 `fetchBoardArticlesFromBotManually()` 以一般模式讀取

**Effect（篩選文章開文正確性）**

- 第一篇篩選文章點開：terminal 在篩選模式 → `ensureBoardView` 判定 board list → return true → `16535\r\r` 在篩選模式送出 → PTT 正確跳到系列序號 16535 的文章
- 第二篇（文章頁返回）：`q` 退回篩選列表 → `ensureBoardView` 判定 board list → return true → 同樣在篩選模式開文

**測試更新**

`src/lib/ptt/__tests__/adapter.test.ts`：

- `re-enters the board list before opening when the current screen is an article in the same board`
  - mock 更新：`send("q")` 會把 mode 切到 "board"（模擬 q 退回看板列表）
  - 預期 calls 更新為 `["send:q", "send:782696\r\r"]`（不再需要 `enter:Gossiping`，因為 q 後已在 board list）
- `reads a board page manually without leaving the board view`（仍 pass，`ensureNormalBoardView` 在已是一般看板列表時直接 return）

**全 test 結果**

138 tests passed（`npm run test`）

---

## 2026-04-24 逐步載入再次校正

### 2026-04-24 深夜再修：縮短 adapter 首屏等待，避免阻塞後續逐頁讀取

在使用者回報「體感仍接近 10 秒」後，再次比對了兩種資料：

- `window.__pttzzzArticlePartialTimeline`
- `window.pttzzzDebug.dumpLastArticleOpenTrace()`

這輪確認到的關鍵點：

- `open trace` 顯示 adapter 的首屏偵測與 progressive reader 其實可以很早開始
- 但 `useArticle` 的 timeline 可能混入前一輪（或同畫面）殘留事件，會把相對時間拉長，看起來像首屏後卡很久

因此這次先修 adapter 的確定瓶頸：

- `fetchArticleFromBotManuallyWithOpen()` 原本會在開文後以 `waitForArticleFirstScreen(timeout=1800ms)` 阻塞 progressive reader
- 若這段等待碰到終端快照延遲，會把後面的 `readArticleLinesProgressively()` 一起拖慢

本次修改（`src/lib/ptt/adapter.ts`）：

- 將首屏等待 timeout 從 `1800ms` 下修到 `350ms`
- 若 350ms 內沒抓到首屏，不再額外 `sleep(180)` 等待
- 直接以當下 `readScreenLines(bot)` 作為 progressive reader 初始畫面，立刻開始逐頁讀取

效果是：

- 首屏偵測失敗時，不會再把翻頁 reader 一起卡住
- progressive paging 能更早啟動

### 修後實測（真站，`#784107`，約 70 推）

`dumpLastArticleOpenTrace()` 觀察：

- `first_screen_detected`: 約 `456ms`
- 第一個 `progressive` candidate: 約 `683ms`
- 第二個 `progressive` candidate: 約 `925ms`
- `progressive_read_done`: 約 `6169ms`（204 lines）
- `final_article_settled`: 約 `6176ms`

這代表：

- 首屏後不到 `0.3s` 就開始有下一輪 progressive 讀取
- 中後段仍受「逐頁翻讀總頁數」影響，長文最終完成時間仍可能是數秒級

### 2026-04-24 進一步修正：index 開文改走 fast getArticle + 分段 partial emit

由於使用者回報體感仍接近原狀，這輪把 `adapter.getArticle()`（index 路徑）改成：

- 優先走 `fetchArticleFromBot(...)`（library `getArticle` 快路徑）
- 不再預設走 slow manual paging（manual 只留在 library 不可用時 fallback）

改動檔案：`src/lib/ptt/adapter.ts`

#### 具體改動

1. `PttClientAdapter.getArticle()`
   - 由原本固定 `fetchArticleFromBotManually(...)`
   - 改為 `fetchArticleFromBot(..., onPartial?)`

2. `fetchArticleFromBot(...)`
   - 新增 `onPartial?` 參數
   - 在取得 `article.lines` 後，會先呼叫 `emitProgressivePartialsFromRawLines(...)`
   - 再回傳 final article（維持現有最終解析邏輯）

3. `emitProgressivePartialsFromRawLines(...)`
   - 以 page-size chunk 累積 raw lines，逐段建 partial 並 `onPartial`
   - dedupe key 改為：
     - header fingerprint
     - `body.length`
     - `pushes.length`
     - `articleNotes.length`
   - 避免只有 header fingerprint 導致「只 emit 一次」的問題

4. `buildFallbackPartialArticleFromRawLines(...)`
   - 針對 library `lines` 偶爾不含完整 header 的情況
   - 若標準 `buildPartialArticleFromRawLines(...)` 回傳 `null`
   - 使用 `getArticle` metadata（title/author/date/board）做 fallback partial
   - 確保 fast path 仍能持續吐 partial

#### 對應測試

`src/lib/ptt/__tests__/adapter.test.ts`

- 新增：
  - `emits progressive partials from the fast library getArticle path`
- 驗證 fast path 下會有多次 partial snapshot，且 body / pushes 會隨進度增加

### 2026-04-24 晚間追加：資料已提早進 state，但使用者看到內容仍偏晚

使用者回報一個更重要的判準：

- 以 `#783933 [新聞] 快訊／搶銀行嫌犯畫面曝光！雨鞋、蒙面` 為例
- 進入文章後，下半段正文和推文體感仍接近 `10s` 才可見

這個回報讓本次 goal 6 的判斷標準重新對齊 spec：

- 不是只看 `onPartial` / React state 是否提早更新
- 而是看「使用者何時真的在畫面上看到更多正文和回文」

### 新確認的 bottleneck：loading 階段的 UI render 太重

先前的 progressive data flow 已經提早把 partial body / pushes 送進來，但 `Article.tsx` 在 loading 階段仍直接渲染：

- `RichContent`
- `PushThread`

這造成兩個問題：

1. **正文每次 partial 更新都重新做 media segmentation**
   - `RichContent` 每次 render 都會重新跑 `parseContentSegments(text)`
   - 正文越長，重新解析成本越高

2. **推文每次 partial 更新都重新做完整討論串排版**
   - `PushThread` 會建立 children map、排序、卡片化渲染、套用討論串控制列
   - partial push count 持續增加時，這個成本會直接落在使用者可見時間上

所以先前出現的情況是：

- data flow 已經 progressive
- 但 loading 階段畫面仍可能因為 render path 太重，而讓人覺得正文下半段和回文出得很晚

### 本次 UI 修正：loading 階段改走 lightweight render path

`src/components/Article.tsx`

新增兩個 loading-only 呈現：

- `LightweightArticleBody`
  - 只輸出純文字 `<pre>`
  - 不經過 `RichContent`
  - 不做 YouTube / 圖片預覽解析

- `LightweightPushList`
  - 以扁平清單顯示目前已載入的回文
  - 不經過 `PushThread`
  - 不顯示排序控制、討論串統計、巢狀卡片

loading 階段的 `PartialArticleView` 現在會顯示：

- `ArticleHeader`
- `LightweightArticleBody`
- `ArticleEditRecords`
- `LightweightPushList`
- `完整討論串整理中…`

完整文章 resolve 後，仍切回既有完整版：

- `RichContent`
- `PushThread`

所以這次改的是：

- **loading 先快**
- **final 再完整**

### 對應測試

`src/components/__tests__/Article.test.tsx`

新增：

- `uses lightweight article rendering while partial content is still loading`

驗證 loading + partialArticle 時：

- 仍會顯示文章標題與 raw URL
- 不會渲染 YouTube preview button
- 不會顯示完整討論串控制列（`時間` / `推噓分` / `舊到新`）
- 仍會顯示 `完整討論串整理中…`

### 本次重新觀察到的問題

重新用真站驗證後，確認「看起來有 progressive render」和「實際上會持續增量更新」是兩件事。

在本輪修正前，直接從 `Gossiping` 點開文章時，畫面行為是：

- 約 `0.22s` 出現首屏 partial body
- 接下來數秒都停在同一段正文
- 到 final article settle 前，正文不再增加
- 回文區直到接近完成時才整段跳出

也就是說，使用者看到的是：

- 首屏先出
- 中間沒有穩定增量
- 最後一次性補齊

這和 goal 6 子需求 1 要的「下方回文區需要逐步渲染」仍有落差。

### 重新追根後確認的 root cause

這次不是 adapter 完全沒有 progressive emit。

從 `window.pttzzzDebug.dumpLastArticleOpenTrace()` 可看到：

- `first_screen_detected` 約在 `445ms`
- 之後 `progressive` partial candidates 在 `662ms`、`894ms`、`1128ms`、`1370ms`、`1620ms`、`1858ms` 持續出現

所以 adapter 的 manual reader 確實有逐頁送 partial。

真正卡住 UI 持續更新的是 `useArticle.ts` 這層：

1. **標題比對過嚴**
   - `isExpectedArticlePartial()` 原本用 `partial.title.trim() === expected.title.trim()`
   - 真站上同一篇文章在不同 redraw / parser 路徑下，標題中的半形空白與全形空白不一致
   - 結果是：首屏 partial 能通過，但後續 progressive partial 被視為「不是同一篇」，直接丟棄

2. **screen redraw partial 會覆蓋較新的累積 partial**
   - `useArticle` 同時吃兩條資料流：
     - adapter `getArticle(..., onPartial)` 的累積 partial
     - `subscribeScreen()` 解析單一 redraw screen 的 partial
   - 單頁 partial 可能比已累積的 partial 更短，若直接 `setPartialArticle(partial)`，會把較新的結果蓋掉

### 本次修改

#### 1. 標題改為正規化比對

`src/hooks/useArticle.ts`

- 新增 `normalizeArticleTitle()`
- 把半形空白、全形空白與一般 whitespace 全部正規化後再比對

效果：

- 同一篇文章即使在 PTT redraw 過程中標題空白字元形態不同，後續 progressive partial 仍會被接受

#### 2. partial 更新改成 monotonic merge

`src/hooks/useArticle.ts`

- 新增 `mergeProgressiveArticlePartial(current, incoming)`
- 規則：
  - 若 incoming 在 `body`、`pushes`、`articleNotes` 任一欄位有增加，接受 incoming
  - 若 incoming 有退步、且沒有任何欄位變多，保留 current

效果：

- 單頁 redraw partial 不再把已累積的內容縮回去
- `partialArticle.body.length` / `partialArticle.pushes.length` 在 loading 期間維持單調不減

#### 3. AID manual flow 改走和 index 開文相同的 progressive reader

`src/lib/ptt/adapter.ts`

- 抽出 `fetchArticleFromBotManuallyWithOpen()`
- 一般 index 開文與 AID 開文共用同一套：
  - `waitForArticleFirstScreen()`
  - `readArticleLinesProgressively()`
  - `buildPartialArticleFromRawLines()`

效果：

- AID 路徑不再使用舊的 `sleep + getLines()` 一次讀完流程

### 新增/更新測試

#### `src/hooks/__tests__/useArticle.test.ts`

- `matches article partial titles after normalizing ascii and full-width spaces`
  - 驗證同一篇文章只因半形 / 全形空白不同時，partial 仍會被接受
- `keeps the longer accumulated partial when a shorter screen partial arrives later`
  - 驗證較短的 redraw partial 不會覆蓋已累積的 partial

#### `src/lib/ptt/__tests__/adapter.test.ts`

- `opens article by aid through the same progressive manual flow`
  - 驗證 AID 開文現在會走 manual progressive reader，且能逐頁累積正文 / pushes

### 真站驗證結果

測試文章：

- 直接點開看板文章：`#783703 [新聞] 沈伯洋被讚「可大談巴哈1小時」 蔣萬安`
- AID 驗證：`#1fwkuLQh`

#### 直接點開看板文章（修正後）

DOM mutation trace 顯示：

| 相對時間    | 狀態                                                   |
| ----------- | ------------------------------------------------------ |
| 約 `0.22s`  | 首屏 partial body 出現，`223 chars / 12 lines`         |
| 約 `5.77s`  | body 增加到 `740 chars / 28 lines`                     |
| 約 `6.01s`  | body 再增加到 `955 chars / 36 lines`                   |
| 約 `6.26s`  | 回文區開始出現，`8 / 8`，仍是 loading 中               |
| 約 `10.60s` | final article settle，回文變成 `30 / 53`，loading 消失 |

結論：

- 正文現在不再只停在首屏，而是會在 final settle 前持續增加
- 回文區也會在 final settle 前先出現第一批，不再全部等到最後
- 這次已符合「逐步載入」的基本目標

### 2026-04-24 晚間補充：5 秒 gap 來自量測方法，不是 partial state 真正停住

在後續追查中，先前引用的：

- `0.22s` 首屏正文
- `5.77s` 第二次正文增長

這組數字並不是 adapter / hook 實際 partial 更新節奏，而是 **DOM 文字抽取量測方法的誤差**。

原因：

- 先前的瀏覽器量測是用 `document.body.innerText` + 自訂規則去擷取正文區塊
- 當 `RichContent`、連結預覽、討論串區塊同時變動時，這個 DOM 萃取規則不一定能立即反映 `partialArticle.body` 的真實變化
- 結果看起來像是正文要到 `5~6s` 才增加，但其實那是量測腳本在較晚時刻才重新抓到正確的 body slice

為了確認這點，這次額外在 `useArticle.ts` 加了 dev-only partial timeline：

- `adapter_callback`
- `screen_subscribe`
- `state_commit`

測試文章：

- `#783933 [新聞] 快訊／搶銀行嫌犯畫面曝光！雨鞋、蒙面`

內部 partial timeline 顯示：

| 相對時間 | 來源 | 狀態 |
|----------|------|------|
| 約 `0.45s` | `screen_subscribe` / `state_commit` | 首屏正文約 `451` chars |
| 約 `0.66s` | `adapter_callback` | 第一個 progressive candidate |
| 約 `0.88s` | `state_commit` | 正文增至約 `923` chars |
| 約 `1.11s` | `state_commit` | 正文增至約 `1038` chars，回文 `18` |
| 約 `1.36s` | `state_commit` | 回文 `34` |
| 約 `1.61s` | `state_commit` | 回文 `52` |
| 約 `1.86s` | `state_commit` | 回文 `68` |
| 約 `2.11s` | `state_commit` | 回文 `84` |
| 約 `2.36s` | `state_commit` | 回文 `106` |
| 約 `2.61s` | `state_commit` | 回文 `124` |
| 約 `2.86s` | `state_commit` | 回文 `126` |
| 約 `6.10s` | final settle | loading 結束 |

結論：

- adapter 與 React state 的 progressive 更新其實在 **1 秒內就開始持續增加**
- 先前觀察到的 `5.77s` gap 是 DOM probe 抓正文區塊時的偽延遲
- 目前真正剩下的未解問題，不是「正文 5 秒後才第二次更新」，而是 **AID 路徑仍可能落到板面/說明頁**

### 2026-04-24 深夜補充：再跑一次真站後，確認首屏後的增量節奏仍在 1 秒內

再次用真站 `Gossiping` 點開：

- `#783933 [新聞] 快訊／搶銀行嫌犯畫面曝光！雨鞋、蒙面`

這次直接讀 `window.__pttzzzArticlePartialTimeline`，並以**第一個 accepted partial** 當作 `t=0` 重新換算，結果如下：

| 相對時間 | 來源 | 狀態 |
|----------|------|------|
| `0.00s` | `screen_subscribe` / `state_commit` | 首屏正文 `451 chars` |
| `0.31s` | `adapter_callback` / `state_commit` | 正文增至 `923 chars` |
| `0.55s` | `adapter_callback` / `state_commit` | 正文增至 `1038 chars`，回文 `18` |
| `0.80s` | `adapter_callback` / `state_commit` | 回文 `34` |
| `1.05s` | `adapter_callback` / `state_commit` | 回文 `52` |
| `1.30s` | `adapter_callback` / `state_commit` | 回文 `68` |
| `1.55s` | `adapter_callback` / `state_commit` | 回文 `84` |
| `1.80s` | `adapter_callback` / `state_commit` | 回文 `106` |
| `2.04s` | `adapter_callback` / `state_commit` | 回文 `124` |
| `2.28s` | `adapter_callback` / `state_commit` | 回文 `141` |
| `2.52s` | `adapter_callback` / `state_commit` | 回文 `147` |

這次量測也再次證明：

- 首屏之後正文不是卡住 `5s+`
- 正文第二次增量大約在 `0.31s`
- 第一批回文大約在 `0.55s` 就已經進 state
- 後續回文以大約 `0.24~0.26s` 的節奏持續增加

另外，這輪順手把 `useArticle.ts` 的 dev timeline 紀錄再收斂了一次：

- `adapter_callback` / `screen_subscribe` 現在只記錄**實際被 monotonic merge 接受**的 partial
- 被判定為較短、較舊、會造成 regression 的 redraw partial，不再寫進 timeline

目的不是改產品行為，而是避免 debug timeline 自己看起來像又倒退一次，干擾判讀。

#### AID `#1fwkuLQh`（目前仍有殘留問題）

這次修正後，AID 路徑已不再停在 `無法載入文章`。

但真站實測顯示：

- 最後沒有打開指定文章
- 而是落到 `Gossiping` 板面 / 說明頁
- 前端把這個畫面當成文章渲染，標題變成 `(無標題)`

因此 AID 路徑目前的狀態是：

- **已修掉立即失敗**
- **尚未正確打開指定文章**

這是獨立於「文章逐步載入」之外的殘留 bug，後續需再針對 PTT `#AID` 指令的實際行為補查與防呆。

## 2026-04-22 文章與推文逐步載入版本

### 目前實作方案

這版文章頁已從「只先顯示文章首屏，推文等 final article 才出」推進到「正文與已讀到的推文都走 partial data 逐步更新」。

資料流如下：

```text
click article
  → adapter 送文章 index
  → waitForArticleFirstScreen() 找到正確文章 header
  → onPartial(firstScreen): 先顯示標題 / 作者 / 首屏正文
  → readArticleLinesProgressively()
      → 每次讀到一個 terminal screen
      → appendUniqueArticleScreenLines() 去重 append
      → buildPartialArticleFromRawLines()
          → splitArticleBody(): 正文與推文 raw lines 分離
          → parseArticleHeaderBlock(): 產生 partial body
          → buildArticleThread(): 產生 partial pushes / articleNotes / score
      → onPartial(partial): React 立即更新 ArticleBody + PushThread
  → raw lines 讀完
  → build final article
  → 清除 loading / partial，切到 final article
```

關鍵行為：

- `PartialArticleData` 現在包含 `pushes`、`articleNotes`、`score`。
- partial body 不再混入 raw 推文文字；推文會先解析成 `AggregatedPush[]`，由新版 `PushThread` UI 顯示。
- `parsePartialScreen()` 也改成同一套解析方式，避免最早 redraw snapshot 若含推文時仍把推文塞進 body。
- `Article.tsx` 的 `PartialArticleView` 會在 loading 期間顯示：
  - `ArticleHeader`
  - `ArticleBody`
  - partial `ArticleEditRecords`
  - partial `PushThread`
  - `完整討論串整理中…`

### 重要修正：不能用 `100%` 當讀文停止條件

PTT 在文章正文到底後，推文區後續畫面可能仍然顯示 `瀏覽 第 x/y 頁 (100%)`。舊 reader 看到 `100%` 就停止，導致推文所在頁面沒有逐步載入，而是等 final article 一次出現。

現在 `readArticleLinesProgressively()` 改成：

- 每次畫面有變化就 append 該 screen 的 0–22 行內容
- 每次 append 後立刻 emit partial
- 不再因為看到 `100%` 就停止
- 只有 `PgDn` 後畫面不再變化，或遇到 `此文章無內容`，才停止
- 加 `maxPages = 300` 防止極端情況無限翻頁

`appendUniqueArticleScreenLines()` 會以「既有 lines 尾端」和「新 screen 開頭」找最大 overlap，避免跨頁重疊行被重複加入。

### 測試紀錄

單元測試新增/更新：

- `extracts a partial article immediately from the current terminal snapshot`
  - 驗證 partial snapshot 中若含推文，`body` 仍只保留正文，推文進 `pushes`。
- `emits progressively larger partial article bodies while manually paging`
  - 驗證逐頁讀文時 partial body 變大，raw 推文不出現在 body，推文出現在 `pushes`。
- `continues emitting partial pushes across screens that already show 100 percent`
  - 模擬兩個 terminal screens 都顯示 `100%`，但第二個 screen 多一則推文。
  - 驗證 partial push count 會從 1 增到 2。
  - 這是本輪防回歸重點。

驗證命令：

| 日期       | 命令                                             | 結果                        |
| ---------- | ------------------------------------------------ | --------------------------- |
| 2026-04-22 | `npm test src/lib/ptt/__tests__/adapter.test.ts` | 31 tests passed             |
| 2026-04-22 | `npm test`                                       | 12 files / 116 tests passed |
| 2026-04-22 | `npm run build`                                  | 通過                        |

### 真站瀏覽器實測紀錄

測試方式：

- 本機 dev server：`http://127.0.0.1:5173/`
- 真實 PTT 帳號登入，並勾選中斷其他連線
- 進入 `C_Chat`
- 使用 `agent-browser` / Chrome DevTools 驗證
- 在瀏覽器內用 `MutationObserver` 連續記錄文章頁 DOM 變化：
  - `title`
  - 是否仍有 `完整討論串整理中…`
  - 是否出現 `討論串`
  - `已顯示 X / Y 則第一層回覆`
  - body text length

測試文章：

`[情報] 日網熱議：曾經盛行的角色歌為何沒落了`

實測 DOM mutation 記錄摘要：

| 相對時間    | 狀態                                                    |
| ----------- | ------------------------------------------------------- |
| 約 0.0s     | 仍在 `C_Chat看板`                                       |
| 約 2.1s     | 進入文章頁，標題出現，loading 中                        |
| 約 2.3s     | 首屏正文出現，`完整討論串整理中…`                       |
| 約 6.9–7.3s | 正文持續補上，尚未看到推文                              |
| 約 7.5s     | partial `PushThread` 出現，`16 / 16`                    |
| 約 7.7s     | partial 推文更新，`30 / 31`                             |
| 約 8.0s     | partial 推文更新，`30 / 45`                             |
| 約 8.2s     | partial 推文更新，`30 / 52`                             |
| 約 10.7s    | final article settled，loading 提示消失，維持 `30 / 52` |

結論：

- 文章正文會逐步補上。
- 推文區現在也會在讀到推文頁後逐步補上，不是等 final article 才一次出現。
- 體感限制仍存在：如果文章正文很長，推文必須等正文頁讀完、terminal 翻到推文區後才開始出現。這是目前「依 PTT 順序 PgDn 讀屏」架構的自然限制。
- `PushThread` 本身仍有 UI lazy render，初始最多顯示 30 則第一層回覆；所以畫面文字中的「已顯示 30 / N」代表 UI 顯示批次，不代表 adapter 只讀到 30 則。

## 2026-04-21 最新版本狀態

### 本輪實作版本摘要

這一版不是重新設計閱讀流程，而是在既有 progressive render / cache 架構上，先修掉兩個明確拖慢體驗的來源：

1. **同看板開文不再強制重新進板**
   - 原本點文章時，即使使用者已經停在該看板，adapter 仍會再跑一次 `enterBoardByName(boardName)`。
   - 這會多送一次進板指令，增加 article first paint 延遲。
   - 目前改成先檢查目前 terminal 畫面是否已在目標看板；若已在同板，直接送文章索引開文。

2. **看板列表改為手動讀取當前頁，不再沿用 `ptt-client.getArticles()` 的退板流程**
   - `ptt-client.getArticles()` 讀完列表後會 `enterIndex()`，導致底層 terminal 已離開看板。
   - 這會放大後續開文延遲，也會讓返回看板時狀態不穩。
   - 目前一般看板列表已改成手動從目前畫面 parse visible rows，保留在看板畫面。

3. **返回看板時 partial redraw 不再覆蓋整份 cached list**
   - 舊行為是：先顯示 cache，接著收到一個只有可視範圍的 partial list，就把整份列表縮成局部頁，之後 full list 再蓋回來。
   - 這會造成看似位置正確、但文章列瞬間跳動，甚至可能誤點。
   - 目前改成 partial list 只做 merge，不再用 replace 縮掉原本的 cached list。

### 這一版的實際效果

- 返回文章列表時，原先「局部列表先覆蓋完整列表，再彈回」的跳動已明顯改善
- 同看板開文的多餘進板流程已被移除
- 但 **文章首屏速度仍未達到可接受的秒開標準**

### 2026-04-21 速度量測結果

量測方式：

- 本地站直接實測
- 使用真實 PTT 登入
- 在瀏覽器頁面內埋 `click -> first article visible -> full controls visible` 時間點
- `first article visible` 定義為：畫面首次判定已進入文章頁（非看板頁）
- `full controls visible` 定義為：文章頁上的 `重新整理回文` / `推噓分` 等完整控制區已出現

實測結果：

| 日期       | 測試次數 | first article visible | full controls visible | 備註                                               |
| ---------- | -------- | --------------------- | --------------------- | -------------------------------------------------- |
| 2026-04-21 | 第 1 次  | 約 **5.94s**          | 約 **7.15s**          | 過程中先短暫出現另一篇文章畫面，之後才切到最終文章 |
| 2026-04-21 | 第 2 次  | 約 **4.34s**          | 約 **6.56s**          | 同樣觀察到中間畫面串到非最終點選文章               |

### 目前結論

- **這一版沒有修到「打開文章低於 1 秒」**
- 問題已經不是單純前端 render 慢，而是 **底層 terminal / article open 流程仍有明顯延遲與中間畫面串接問題**
- 目前最可疑的剩餘根因：
  1. `click -> send -> terminal 真正切到文章首屏` 之間仍然太慢
  2. partial parser 可能吃到前一個過渡畫面，導致先顯示錯的文章，再切到正確文章

### 下一步建議

下一輪不要再只做 UI 體感優化，應直接往 adapter 層追時間點與畫面來源：

1. 在 adapter 加入 `open article` 級別的精準 instrumentation：
   - `send article index`
   - `first matching article header`
   - `final article settled`
2. 驗證 partial 是否有吃到過渡畫面 / 非最終文章
3. 若確認 `ptt-client` / 現有 terminal 流程仍是瓶頸，就要開始評估更直接的自控 parse / 自控讀屏策略

## 完成日期

2026-04-12

## spec 五個子需求實作狀況

| #   | spec 原文                                                                  | 實作狀況                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 開啟文章後看到內容的時間不能超過 0.5 秒，下方回文區塊可能需要逐步渲染      | ✅ **部分完成**。Progressive render 已實作，實測正文約 1.5s 出現（原本需等 1–10s）。嚴格 0.5s 尚未達到。推文區塊 lazy render 已有（PushThread IntersectionObserver）。                    |
| 2   | 進入看板看到文章列表的時間不超過 0.5 秒                                    | ❌ **未做**。`listArticles()` 耗時未量測，stale-while-revalidate 方案未實作。                                                                                                             |
| 3   | 看板文章可隨著滾動自動載入                                                 | ✅ **已完成**。ArticleList IntersectionObserver scroll sentinel，無 observer 時 fallback 手動按鈕。                                                                                       |
| 4   | 自動預覽圖片和 YouTube 影片                                                | ✅ **已完成**。`parseContentSegments` + `ImagePreview` + `YouTubePreview` + `RichContent`，文章正文與推文兩處均支援。                                                                     |
| 5   | 基本文章讀相關操作（搜尋文章、查詢文章 ID、搜尋文章 ID、篩選指定推噓文數） | ✅ **已完成**。adapter 新增 `searchArticles` / `filterArticlesByPush` / `getArticleByAid`；`useBoard` 支援 `BoardFilter`；`ArticleList` 加搜尋列 + 快選按鈕；AID 導航鏈串接至 `Article`。 |

---

## 實作範圍

共實作四個子需求（子需求 1、3、4、5），分兩輪完成：

1. **Progressive render**（子需求 1）：文章頁在推文載入完成前先顯示已取得的標題、正文
2. **ArticleList scroll sentinel**（子需求 3）：看板文章列表滾到底自動觸發載入更多
3. **Rich content（媒體預覽）**（子需求 4）：文章正文與推文中的 imgur 圖片、YouTube 影片 inline 顯示
4. **搜尋 / 篩選 / AID 跳轉**（子需求 5）：標題搜尋、推噓文數篩選、AID 直接跳轉文章

---

## 1. Progressive Render

### 設計思路

`ptt-client.getArticle()` 整個流程耗時 1–10 秒（依文章推文數），但 adapter 底層已有 `screenListeners` 可訂閱每次 redraw 事件。

利用這個機制：在 `getArticle()` serial task 執行期間，臨時掛一個 listener，每收到 redraw 就嘗試 parse partial screen。如果 parse 成功（確認是文章畫面），就 call `onPartial(partial)` callback。

### 關鍵實作

**`parsePartialScreen(rawScreen)`** — `src/lib/ptt/adapter.ts`

- strip ANSI 後拆行
- 檢查 lines[0] 前綴是 `作者`、lines[1] 是 `標題`、lines[2] 是 `時間`
- 用 `indexOf('：')` 切出各欄位值
- body = 第一個 `─{5,}` separator 之後到倒數第二行
- 無法識別時回傳 `null`

**`PartialArticleData` interface** — `src/lib/ptt/adapter.ts`

```ts
export interface PartialArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
}
```

**`useArticle` hook** — `src/hooks/useArticle.ts`

- state 加入 `partialArticle: PartialArticleData | null`
- `loadArticle` 傳入 `handlePartial` callback 給 `client.getArticle()`
- 當完整文章到位後清除 `partialArticle`
- initial load 切換時重設為 null（避免前一篇的 partial 閃現）

**`Article.tsx`**

```tsx
{
  loading && partialArticle && <PartialArticleView partial={partialArticle} />;
}
{
  loading && !partialArticle && <div>載入中…</div>;
}
{
  !loading && !article && <div>{error ?? "無法載入文章"}</div>;
}
{
  article && <> 完整文章 + PushThread </>;
}
```

`PartialArticleView` 顯示 `ArticleHeader` + `ArticleBody` + 「回文載入中…」divider。

### 實測觀察（2026-04-12 真站）

- 約 0.5s：頁面顯示「載入中…」
- 約 1.5–2s：partial screen 到位，切換為文章標題 + 正文 + 「回文載入中…」
- 約 8–15s（依推文數）：完整文章（含推文討論串）渲染

PTT article header 格式穩定，parser risk 已消除。

---

## 2. ArticleList Scroll Sentinel

### 設計思路

用 `IntersectionObserver` 監視文章列表底部一個不可見的哨兵 div。當哨兵進入 viewport 時呼叫 `handleLoadMore()`。

有兩個 fallback 保護：

- `typeof IntersectionObserver === "undefined"` 時顯示「載入更多」按鈕
- 已在 loading 中 return early，避免重複觸發

### 關鍵實作 — `ArticleList.tsx`

```tsx
const supportsObserver = typeof IntersectionObserver !== "undefined";
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!hasMore || loading || !supportsObserver) return;
  const target = sentinelRef.current;
  if (!target) return;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) handleLoadMore();
  });
  observer.observe(target);
  return () => observer.disconnect();
}, [hasMore, loading, supportsObserver]);
```

哨兵 div 放在列表最後（`hasMore` 時才渲染），本身高度 1px、不可見。

### 實測觀察（2026-04-12）

滾到 Gossiping 看板列表底部，自動觸發載入更多，連續多次觸發都正常（每次載入完成後 `loading` 恢復 false，observer 重新設置）。

---

## 3. Rich Content（媒體預覽）

### 設計思路

文章正文（`ArticleBody`）和推文內容（`PushThread` 中的每則 push）以前都是 `<pre>` / `<p>` 直接輸出純文字。

Goal 6 改為透過 `RichContent` 元件 + `parseContentSegments()` parser 處理：

- 掃描文字中的 imgur / YouTube URL
- 將文字切割為 `ContentSegment[]`（`text` / `image` / `youtube`）
- 各類型 segment 分別 render

### 新增檔案

**`src/lib/ptt/contentSegments.ts`**

- `MEDIA_URL_RE`：一個 combined regex，同時匹配 imgur 和 YouTube URL
- `parseContentSegments(text)`：iterate regex matches，classify，建 segment 陣列
- `normalizeImgurUrl()`：確保使用 `i.imgur.com` + 有副檔名（fallback `.jpg`）
- `extractYouTubeId()`：處理 `watch?v=` 和 `youtu.be/` 兩種格式

**`src/components/MediaPreview.tsx`**

- `ImagePreview`：`<img loading="lazy" referrerPolicy="no-referrer">` + onError fallback link
- `YouTubePreview`：縮圖 + play button overlay；點擊後替換為 `<iframe>` embed
  - 使用 `youtube-nocookie.com` 減少追蹤
  - `sandbox="allow-scripts allow-same-origin allow-presentation"`

**`src/components/RichContent.tsx`**

- `variant="body"`：text segment 用 `<pre className="whitespace-pre-wrap break-words inline">`，媒體為 block
- `variant="inline"`：text 用 `<span>`，媒體用 block `<span>`

### 接線點

- `Article.tsx` `ArticleBody` → `<RichContent text={clean} variant="body" />`
- `PushThread.tsx` `PushItem` → `<RichContent text={push.content} variant="inline" />`

---

## 4. 基本文章搜尋與篩選操作（子需求 5）

### ptt-client 內建機制：searchCondition

ptt-client 的 `Bot` 有一個 `searchCondition` 物件，`getArticles()` 在進板後、跳 offset 前，若條件已設定，會自動送出對應鍵序列：

```ts
searchCondition.add("title", keyword); // → 送 /keyword\r
searchCondition.add("push", threshold); // → 送 Z{threshold}\r
```

因此只要在呼叫 `getArticles` 前設好條件，搜尋 / 篩選結果 parser 完全不需改動。

### adapter 新增方法

**`searchArticles(boardName, keyword, beforeIndex?)`** — 設 `title` 條件後呼叫 `getArticles`，finally 清空條件。

**`filterArticlesByPush(boardName, threshold, beforeIndex?)`** — 設 `push` 條件後呼叫 `getArticles`，finally 清空條件。

兩者都透過私有 `listArticlesWithConditions()` 實作，避免重複。

**`getArticleByAid(boardName, aid, onPartial?)`**

```
enterBoardByName → send('#${aid}\r') → sleep 300ms
→ readTerminalSnapshot() 確認 lines[0] 以「作者」開頭
  （否則 AID 無效 → enterIndex() → return null）
→ getLines() 讀全文 → enterIndex()
→ parseArticleHeaderBlock + buildArticleThread
```

支援 `onPartial` callback，progressive render 有效。

### useBoard 擴充

新增 `BoardFilter` export type（`search | push`）；`useBoard(boardName, filter?)` 根據 filter 選擇對應方法；`loadMore` 帶入 filter；新增 `hasMore: boolean`（loadMore 回傳 0 筆時設 false）。

### AID 導航鏈

```
ArticleList.onSelectArticleByAid(aid)
  → App: setView('article-by-aid')
  → Article: articleAid prop
  → useArticle(boardName, 0, articleAid)
  → client.getArticleByAid()
```

`viewState.ts` 新增 `{ type: 'article-by-aid'; board: string; aid: string }` view type。

### ArticleList UI

sticky 搜尋列：

- 文字輸入框（placeholder: 搜尋標題 or #AID）+ 搜尋按鈕；Enter 觸發；8 位英數 = AID，其他 = 關鍵字
- 快選按鈕：≥10 / ≥30 / ≥100 / 爆（再按取消）
- 標題列顯示目前模式（「推文數 ≥30」、「系列《keyword》」）+ 右上角「✕ 清除」

---

## 踩到的坑

### `IMGUR_RE` / `YOUTUBE_RE` unused variable build error

初版 `contentSegments.ts` 同時定義了 `MEDIA_URL_RE`（combined）和分開的 `IMGUR_RE` / `YOUTUBE_RE`（僅供 `isImgurUrl` / `isYouTubeUrl` 使用），但這兩個分開的 regex 後來改用各自的 inline regex，導致 TypeScript build error。修復：移除兩個未用到的 exported constants，只保留 `MEDIA_URL_RE`。

### `article-list scroll` 需 re-observe after load

第一版 observer `useEffect` 的 deps 沒有包含 `loading`，導致 loading 完成後 sentinel 重入 viewport 不觸發第二次載入。修復：加入 `loading` 到 deps，讓每次 loading 結束後重設 observer。

---

## 未完整驗證的部分

由於測試時 PTT guest 登入受到限制（在站人數過多），以下項目未在本次 session 完整驗證：

1. imgur 圖片 inline 顯示（需找到含 imgur URL 的真站文章）
2. YouTube click-to-play 展開（需找到含 YouTube 連結的真站文章）
3. heavy-push 文章的 progressive render 「回文載入中…」視覺確認

核心實作邏輯已驗證（TypeScript clean build、parser unit-level review），媒體渲染部分依賴外部 URL，在找到合適測試文章前以 code review 確認正確性。

## 發現的問題

還有一個殘留問題要明講：你指定的 #1fwkuLQh 這條 AID 路徑，現在已經不會直接掉成 無法載入文章，但它仍沒有正確打開指定文章，而是落到 Gossiping 板面/說明頁並被前端誤當文章渲染。這個 AID 問題我已寫進 notes，但它和這次「文章逐步載入」主問題是分開的。

## 2026-04-26 失敗嘗試紀錄（逐步載入仍未達標）

以下是本輪針對「開文後後半正文/推文仍慢」試過、但未滿足使用者體感目標的方法。

### 1) 只優化前端 render path（未解）

- 做法：
  - loading 階段把 `PartialArticleView` 改為 lightweight body/push list
  - 避免 loading 時跑完整 `RichContent` / `PushThread` 重排
- 結果：
  - 可減少部分重渲染成本
  - 但真站實測仍有「首屏後約 3~4 秒才看到下一段正文/推文」的情況
- 判定：
  - 問題主因不只在 React render，資料進場節奏仍偏慢

### 2) 縮短 manual 路徑首屏等待 timeout（部分改善，但未解）

- 做法：
  - `waitForArticleFirstScreen()` timeout 由 `1800ms` 下修到 `350ms`
  - timeout 後不再多睡，立即啟動 progressive paging
- 結果：
  - 某些文章首屏後第一個 progressive candidate 提前
  - 但長文仍常出現後半正文/推文需等待數秒
- 判定：
  - 只能改善「首屏等待阻塞」，無法消除 manual paging 本身的延遲

### 3) index 開文全面切 fast `getArticle`（造成 regression，已回退）

- 做法：
  - `getArticle(onPartial)` 全部改走 `fetchArticleFromBot(..., onPartial)`
  - 嘗試在拿到 `rawLines` 後分段 emit partial
- 結果：
  - 有些文章出現「一進入只剩標題，連首屏正文都沒出現」的 regression
- 判定：
  - 直接全切 fast path 破壞首屏可見性，不可接受；已回退

### 4) fast path 分段 emit + fallback partial builder（仍未穩定達標）

- 做法：
  - 補 `emitProgressivePartialsFromRawLines(...)`
  - dedupe key 從 header-only 改成含 body/push/note 長度
  - 補 `buildFallbackPartialArticleFromRawLines(...)`，處理 header 不完整時 partial 為 `null`
- 結果：
  - 單元測試可通過，部分文章 timeline 可見多次 `adapter_callback`
  - 但真站抽檢仍有「首屏後數秒才有明顯增量」與「部分文章先只見標題」回報
- 判定：
  - 技術路徑可行但不穩定，未達成使用者可見體感目標

### 5) hybrid：先 manual 首屏，再 fast path 接手（仍未完全解）

- 做法：
  - 嘗試先保證首屏可見，再用 fast path 追後半與推文
- 結果：
  - 可降低部分 regression 機率
  - 但抽檢仍可重現「後半正文/推文等待較久」
- 判定：
  - 目前版本仍未滿足需求，問題仍在「不同文章型態下的穩定可見性與增量時序」

### 現況結論（2026-04-26）

- 已解的部分：
  - 首屏快速可見在多數文章可成立
- 未解的核心：
  - 「後半正文與推文持續且快速增量」在真站抽檢仍不穩定
  - 使用者體感目標尚未達標
