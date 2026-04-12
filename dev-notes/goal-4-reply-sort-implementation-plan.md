# 目標 4：第一層聚合回文排序實作規劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文章內文的回文列表提供排序控制，讓使用者可對第一層聚合後回文依回文時間或推文數做遞增、遞減排序，並保留巢狀回覆結構。

**Architecture:** 排序應放在 UI 呈現層，以 `AggregatedPush[]` 已完成的聚合與 `replyTo` 關係為輸入，不重新解析 raw PTT 內容，也不改變 `rawFloor` / `sourceFloors` / `replyTo` 語意。`PushThread` 負責建立 children map、產生第一層清單、套用排序與 lazy 顯示批次。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Tailwind CSS。

---

## 需求解讀

`spec.md` 目標 4 原文：

> 文章內文的回文列表有按鈕能重新排序第一層聚合後的回文，排序可依據回文時間（預設）、推文數，可遞增和遞減排序

這句話有幾個已能落地的解讀：

1. 排序對象是「第一層聚合後的回文」，也就是 `replyTo === null` 的 `AggregatedPush`。
2. 子回覆不參與第一層排序；每個第一層節點底下的 children 應維持討論串內原始時間順序。
3. 預設排序是回文時間，且目前資料中最穩定的時間序是 `anchorOrder`，不是 `time` 字串本身。
4. 推文數排序本案決定使用聚合後 reply 的 `score` 欄位，因為現有資料層已把巢狀推噓回覆統計到被回覆的聚合 reply 上。
5. 排序只改 UI 顯示順序，不應改變文章總分、樓號解析、巢狀掛靠或 debug dump。

## 現況定位

目前相關資料模型在 [`src/lib/ptt/pushAggregator.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/pushAggregator.ts)：

- `AggregatedPush.replyTo`：是否為巢狀回覆。
- `AggregatedPush.score`：此聚合回文收到的巢狀推噓分數。
- `AggregatedPush.floorNumber`：第一層樓層號，巢狀回覆繼承父層。
- `AggregatedPush.anchorOrder`：回文在原文中的相對位置。
- `AggregatedPush.sourceFloors`：此聚合回文包含的原始 PTT 推文樓號。

目前 `PushThread` 在 [`src/components/PushThread.tsx`](/Users/linbangqi/pttzzz/src/components/PushThread.tsx)：

- 先建立 `childrenMap`，children 依 `anchorOrder` 排序。
- 再用 `pushes.filter((push) => push.replyTo === null)` 取第一層。
- 最後直接依 `topLevel.map(...)` 渲染。

因此排序功能不需要改 adapter、parser 或 aggregator 的核心語意。最小合理改動點是 `PushThread`。

## 建議設計

### 排序狀態

在 `PushThread` 內部加入本地 UI state：

```ts
type ReplySortKey = "time" | "score";
type ReplySortDirection = "asc" | "desc";

interface ReplySortState {
  key: ReplySortKey;
  direction: ReplySortDirection;
}
```

建議預設：

```ts
const DEFAULT_REPLY_SORT: ReplySortState = {
  key: "time",
  direction: "asc",
};
```

原因：

- PTT 原始閱讀順序通常是舊到新。
- `spec.md` 只寫「回文時間（預設）」但沒有明確寫預設方向；用 `asc` 最接近目前既有行為。
- 若未來產品想改成新到舊，只需改預設方向，不影響排序架構。

### 排序 key

回文時間排序建議用 `anchorOrder`，不是 `time`。

原因：

- `time` 目前格式是 `MM/DD HH:mm`，沒有年份。
- PTT 熱門文章跨日、跨年、缺 time、或 parser fallback 時，用字串排序都有風險。
- `anchorOrder` 是 parser / adapter 保留下來的原文位置，相對順序最穩定。

推文數排序決定用 `score`。

原因：

- 現有 `score` 是「此回文收到的巢狀推噓分數」，符合 `implement.md` 中「單則聚合推文的 score 計算」現況。
- `spec.md` 寫「推文數」原本可能有歧義：可能指淨推噓分，也可能指所有巢狀回覆數。本案採前者，也就是現有 `score`。

`score` 的意思：

- 某個第一層聚合回文收到一則巢狀 `推`，分數 `+1`。
- 收到一則巢狀 `噓`，分數 `-1`。
- 收到 `→` 或作者編輯補充，不加分也不扣分。
- 所以 `score = 巢狀 push 數 - 巢狀 boo 數`，不是「底下總共有幾則回覆」。

例子：

- A 回文底下有 5 則 `推`、2 則 `噓`、3 則 `→`，`score = 5 - 2 = +3`。
- B 回文底下有 0 則 `推`、4 則 `噓`、10 則 `→`，`score = 0 - 4 = -4`。
- 依 `score desc` 排序時，A 會排在 B 前面。

UI 文案建議使用「推噓分」而不是「推文數」，避免讓使用者誤以為是巢狀回覆總數。

### tie-breaker

所有排序都需要穩定 tie-breaker，避免同分或同時間切換時列表跳動：

1. 主要排序：`anchorOrder` 或 `score`
2. 次要排序：永遠用 `anchorOrder` 遞增
3. 最後 fallback：`id.localeCompare(...)`

建議規則：

```ts
function compareTopLevelReplies(
  a: AggregatedPush,
  b: AggregatedPush,
  sort: ReplySortState,
): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const primary =
    sort.key === "score" ? a.score - b.score : a.anchorOrder - b.anchorOrder;

  if (primary !== 0) return primary * direction;

  const anchorTie = a.anchorOrder - b.anchorOrder;
  if (anchorTie !== 0) return anchorTie;

  return a.id.localeCompare(b.id);
}
```

本案決定：如果 `score desc` 時同分，tie-breaker 不跟著變成新到舊；高分排序的同分項維持原始時間序，閱讀負擔最低。

### children 排序

children 應繼續只用 `anchorOrder` 遞增排序。

原因：

- 子回覆是針對某一則父回文的對話脈絡，改成依 score 排序會破壞語意。
- 需求明確寫「第一層聚合後的回文」，不應擴張到整棵 tree。
- 作者編輯節點 type `edit` 也在 children 中，依 `anchorOrder` 可保留插入位置。

### UI 控制

建議在 `PushThread` 標題列右側加入控制列：

- 一組排序依據按鈕：
  - `時間`
  - `推噓分`
- 一個方向切換按鈕：
  - 時間 asc：`舊到新`
  - 時間 desc：`新到舊`
  - score asc：`低到高`
  - score desc：`高到低`

避免用 select 的原因：

- 需求寫「有按鈕」。
- 兩個維度拆開，比四個選項更不容易藏功能。
- 手機上兩個小 segmented controls 比 select 更直覺。

但需要注意目前 UI 有多處 `rounded-2xl`，若後續要配合前端規範，按鈕 radius 應收斂到 8px 以下。

## Lazy 載入設計

`spec.md` 的閱讀體驗寫到：

- 開啟文章後看到內容的時間不能超過 0.5 秒
- 下方回文區塊可能需要逐步渲染

排序功能會增加一個明顯風險：如果熱門文章有大量聚合回文，每次切換排序都同步渲染完整 thread，可能造成卡頓。

### 第一版決策：UI-level incremental rendering + scroll sentinel

先不要做資料層分頁，也不要改 adapter。資料仍一次拿到完整文章與完整 `pushes`，但 `PushThread` 只渲染排序後的前 N 個第一層節點，並在使用者捲動到列表底部 sentinel 時自動增加顯示批次。

建議常數：

```ts
const INITIAL_VISIBLE_TOP_LEVEL_REPLIES = 30;
const REPLY_RENDER_BATCH_SIZE = 30;
```

行為：

1. `sortedTopLevel` 是完整排序結果。
2. `visibleTopLevelCount` 控制目前顯示前幾個第一層節點。
3. 初始顯示 30 個第一層節點。
4. 使用者捲動到底部 sentinel 進入 viewport 時，自動增加 30。
5. 切換排序時，`visibleTopLevelCount` 重設為 30，避免切到高分排序後一次渲染大量節點。
6. 標題列顯示 `已顯示 X / Y 則第一層回覆`。
7. 若瀏覽器沒有 `IntersectionObserver`，提供 fallback「顯示更多回覆」按鈕。

這個方案的優點：

- 不改 PTT 讀取流程。
- 不改聚合規則。
- 可以直接改善首屏與排序切換後的渲染壓力。
- 行為符合「隨著滾動能持續 loading 進入」。

限制：

- 資料解析仍是一次完成，不能改善 `getArticle()` 自身耗時。
- 第一批 top-level 的 children 仍會一次完整渲染；如果某個第一層底下有數百個 children，還是可能卡。
- 未來可再加「子回覆展開 / 收合」，但這不屬於目標 4 的必要範圍。

### 手動重新整理新回文

滾動 lazy loading 只處理「已經抓回來的 `article.pushes` 要分批渲染」。它不會向 PTT 重新抓新資料。

使用者也需要一個手動操作來重新抓文章，取得可能新增的回文。建議在討論串標題列加入「重新整理回文」按鈕，行為是呼叫 `useArticle` 暴露的 `reload()`，重新執行 `client.getArticle(boardName, articleIndex)`，並用新的 article data 取代目前畫面。

設計原則：

- 「自動載入更多」是前端 render lazy，不打 PTT。
- 「重新整理回文」才會重新打 PTT，整篇文章重新讀取與聚合。
- 重新整理時保留目前排序設定。
- 重新整理完成後，把 `visibleTopLevelCount` 重設為初始批次，避免新資料一次渲染太多。
- 重新整理中按鈕顯示 `更新中...` 並 disabled。
- 重新整理失敗時沿用 `useArticle` 現有 error 顯示策略，避免清掉可讀的舊文章內容。

「故意拖拉邊界」可以視為第二版 pull-to-refresh：

- 桌面與手機瀏覽器的 overscroll 行為不一致，第一版先用明確按鈕較穩。
- 若之後要做，可在討論串頂部或底部加 pull threshold，觸發同一個 `reload()`。
- 不要把 pull-to-refresh 和 lazy sentinel 混在同一個事件上；前者重新抓 PTT，後者只增加已載入資料的 render count。

### 不建議第一版做資料層 lazy parse

理論上可把推文 parser / aggregator 改成 streaming 或 chunked aggregation，但第一版不建議。

原因：

- 現有巢狀規則依賴 `sourceFloors` 與 `replyTo`，雖然單向掃描可做，但作者編輯補充掛靠也依賴文章位置。
- 文章總分與高分排序需要完整第一層 score；若資料未完整聚合，高分排序會不穩定。
- `ptt-client.getArticle()` 目前回傳整篇文章，資料來源不是現成的 paginated push API。

### 後續目標：量測真實瓶頸

目前的 lazy loading 只處理 UI render 數量，沒有證明實際瓶頸一定在 render。後續若要優化閱讀體驗，應先用 performance marks 分段量測，而不是直接重構資料層。

建議量測分段：

1. `getArticle`：從呼叫 `client.getArticle(boardName, articleIndex)` 到拿到 raw article data。
2. `parse / aggregate`：從 raw article data 進入 parser / aggregator 到產出 `article.pushes`。
3. `first article render`：React 拿到 article data 到文章 header / body 出現在畫面。
4. `first thread render`：`PushThread` 初始批次 render 完成。
5. `sort rerender`：切換時間 / 推噓分排序後，到目前可見批次 render 完成。
6. `incremental render`：scroll sentinel 觸發後，到下一批回文 render 完成。

建議第一版只在 dev 環境記錄：

```ts
performance.mark("pttzzz:article:get:start");
performance.mark("pttzzz:article:get:end");
performance.measure(
  "pttzzz:article:get",
  "pttzzz:article:get:start",
  "pttzzz:article:get:end",
);
```

可先輸出到 `console.table(performance.getEntriesByName(...))` 或 `window.pttzzzDebug`，不要先做正式 analytics。

判讀方向：

- 如果 `getArticle` 佔大頭，後續才研究 PTT 讀取策略、cache、背景 refresh 或資料層分段。
- 如果 parse / aggregate 佔大頭，後續才研究 parser/aggregator chunking 或 worker。
- 如果 first thread render / sort rerender 佔大頭，才繼續加強 UI virtualization、children lazy expand、memoization。
- 如果 incremental render 仍卡，代表單批 30 則太大，或單一 top-level children 太多，需要調整 batch size 或做 children 收合。

## 需要釐清的問題

這些不是第一版的硬 blocker，但實作前最好定義清楚：

1. 「推文數」是否等於目前 `score` 淨分？
   - 目前 `score = 巢狀 push - boo`。
   - 本案已決定採用 `score` 作為排序依據。
   - UI 文案用「推噓分」，不使用容易誤解的「推文數」。

2. 預設時間方向是舊到新還是新到舊？
   - 本案決定舊到新，等同目前顯示順序。

3. score 排序的負分如何處理？
   - 本案決定 `desc` 為高分到低分：`+10, +2, 0, -1`。
   - `asc` 為低分到高分：`-5, 0, +1, +8`。

4. 同分時排序要不要跟隨方向？
   - 本案決定同分永遠保留原始時間遞增，避免列表不必要跳動。

5. 排序狀態是否需要記憶？
   - 本案決定第一版只存在 `PushThread` component state。
   - 若未來希望跨文章記憶，可提升到 app store 或 localStorage。

6. 切換排序時是否需要捲到討論串頂端？
   - 本案決定第一版不自動捲動，避免干擾。
   - 若加入 lazy rendering 並重設 visible count，使用者在列表中段切排序可能看不到結果開頭；目前可接受。

7. Lazy 載入要手動按鈕還是自動？
   - 本案決定：已取得回文隨著滾動自動載入更多。
   - 另外提供「重新整理回文」按鈕，用來重新抓 PTT 新回文。
   - pull-to-refresh / 拖拉邊界可列第二版，不阻塞第一版。

## 主要風險

### 1. 「推文數」命名和現有 score 語意不一致

目前 `score` 是淨推噓分，不是「數量」。如果 UI 直接寫「推文數」，使用者可能期待的是收到多少巢狀回覆，而不是 `push - boo`。

第一版 UI 使用「推噓分」字樣；文件中註明這是目前資料模型直接支援的排序。

### 2. 使用 `time` 字串排序會錯

不要用 `time` 直接排序。PTT time 缺年份，且同分鐘多筆也很常見。用 `anchorOrder` 才能維持原始順序。

### 3. 排序不能改變 `replyTo`

`回x樓` 已定義為原始 PTT 推文樓號，排序只是 display order。任何會重算 `floorNumber` 或 `sourceFloors` 的 UI 排序都會破壞既有語意。

### 4. Lazy rendering 和搜尋 / 錨點會衝突

目前尚未有回文內搜尋或錨點跳轉。未來若加入「跳到第 x 樓」或「搜尋回文」，lazy rendering 需要能自動增加 visible count 直到目標出現。

### 5. SSR static markup 測試不足以覆蓋互動

現有 `PushThread` 測試用 `renderToStaticMarkup`。排序按鈕需要互動測試，若不引入 React Testing Library，只能先測純排序 helper。建議把排序 helper 抽成可單元測試的 pure function，互動用較少量 browser 驗證補上。

## 建議改檔範圍

### 1. `src/components/PushThread.tsx`

負責：

- 定義排序 state。
- 建立 `childrenMap` 時維持 children 依 `anchorOrder` 排。
- 取出 top-level 後套用 pure sorting helper。
- 加入排序按鈕 UI。
- 加入 lazy visible count、scroll sentinel 與 `IntersectionObserver`。
- 在不支援 `IntersectionObserver` 時顯示 fallback「顯示更多回覆」按鈕。
- 顯示「重新整理回文」按鈕，透過 prop 呼叫上層 reload。
- 切換排序 key / direction 時重設 visible count。

### 2. `src/hooks/useArticle.ts`

負責：

- 將目前 `client.getArticle(boardName, articleIndex)` 抽成可重用的 `loadArticle()`。
- `UseArticleReturn` 新增：
  - `reloading: boolean`
  - `reload: () => Promise<void>`
- 初次載入仍使用 `loading`。
- 手動重新整理使用 `reloading`，失敗時不要先清空既有 article。

### 3. `src/components/Article.tsx`

負責：

- 從 `useArticle` 取得 `reload` / `reloading`。
- 傳給 `PushThread`：

```tsx
<PushThread
  pushes={article.pushes}
  score={article.score}
  onRefresh={reload}
  refreshing={reloading}
/>
```

### 4. `src/components/__tests__/PushThread.test.tsx`

負責：

- 測試預設時間排序維持 `anchorOrder` 遞增。
- 測試時間 desc 的排序 helper。
- 測試 score desc / asc 的排序 helper。
- 測試 children 不受 top-level 排序影響。
- 測試 lazy rendering 初始只顯示第一批 top-level，並保留總數文字。
- 測試 fallback「顯示更多回覆」按鈕文案存在於不支援 observer 的情境。

若要保留現有 SSR 測試方式，建議將排序 helper export：

```ts
export function sortTopLevelPushes(
  pushes: AggregatedPush[],
  sort: ReplySortState,
): AggregatedPush[] {
  return [...pushes].sort((a, b) => compareTopLevelReplies(a, b, sort));
}
```

互動行為若要完整驗證，需要新增 React Testing Library 或改用瀏覽器測試；第一版可以先不引入新測試依賴。

### 5. `src/hooks/__tests__/useArticle.test.ts` 或既有 hook 測試檔

目前沒有 `useArticle` 測試。若要完整覆蓋 reload 行為，可以新增 hook 測試；若先不引入 React Testing Library，至少在實作時保持 `reload` 函式簡單，並以手動 dev server 驗證。

測試重點：

- 初次載入會設定 `loading`。
- 手動 reload 會設定 `reloading`。
- reload 成功會替換 article。
- reload 失敗不會清空既有 article。

### 6. `src/App.tsx`

可選修改：

- 增加 mock pushes 的數量與 score 差異，方便 `?preview=article` 手動看排序效果。

這不是必要項。若不想動 preview data，可以只靠測試與真站文章驗證。

### 7. `implement.md`

完成實作後可補一段 high-level 狀態：

- 回文列表可依時間 / 推噓分排序。
- 回文列表採第一層 scroll lazy rendering，降低熱門文章初始渲染成本。
- 討論串提供手動重新整理回文，重新抓取文章以取得新回文。

## 任務拆解

### Task 1: 抽出排序型別與 pure helper

**Files:**

- Modify: `src/components/PushThread.tsx`
- Test: `src/components/__tests__/PushThread.test.tsx`

- [ ] **Step 1: 在測試中建立排序案例**

新增測試資料：

```ts
const oldLow = push({
  id: "push-old-low",
  content: "old low",
  score: 1,
  anchorOrder: 10,
});

const midHigh = push({
  id: "push-mid-high",
  content: "mid high",
  score: 8,
  anchorOrder: 20,
});

const newZero = push({
  id: "push-new-zero",
  content: "new zero",
  score: 0,
  anchorOrder: 30,
});
```

測試預期：

- `time asc`：old low, mid high, new zero
- `time desc`：new zero, mid high, old low
- `score desc`：mid high, old low, new zero
- `score asc`：new zero, old low, mid high

- [ ] **Step 2: 實作 helper**

在 `PushThread.tsx` export：

```ts
export type ReplySortKey = "time" | "score";
export type ReplySortDirection = "asc" | "desc";

export interface ReplySortState {
  key: ReplySortKey;
  direction: ReplySortDirection;
}

export const DEFAULT_REPLY_SORT: ReplySortState = {
  key: "time",
  direction: "asc",
};
```

並加入 `sortTopLevelPushes`。

- [ ] **Step 3: 跑測試**

Run:

```bash
npm test -- src/components/__tests__/PushThread.test.tsx
```

Expected: sorting helper tests pass.

### Task 2: 把排序接進 `PushThread` render

**Files:**

- Modify: `src/components/PushThread.tsx`
- Test: `src/components/__tests__/PushThread.test.tsx`

- [ ] **Step 1: 在 `PushThread` 加入 state**

使用：

```ts
const [sort, setSort] = useState<ReplySortState>(DEFAULT_REPLY_SORT);
```

- [ ] **Step 2: 將 topLevel 改為 sortedTopLevel**

流程：

```ts
const topLevel = pushes.filter((push) => push.replyTo === null);
const sortedTopLevel = sortTopLevelPushes(topLevel, sort);
```

渲染時改用 `sortedTopLevel`。

- [ ] **Step 3: 加入排序控制列**

按鈕：

- `時間`
- `推噓分`
- direction button: `舊到新` / `新到舊` / `低到高` / `高到低`

- [ ] **Step 4: 跑測試**

Run:

```bash
npm test -- src/components/__tests__/PushThread.test.tsx
```

Expected: existing rendering tests still pass.

### Task 3: 加入第一層 scroll lazy rendering

**Files:**

- Modify: `src/components/PushThread.tsx`
- Test: `src/components/__tests__/PushThread.test.tsx`

- [ ] **Step 1: 加入常數、state 與 sentinel ref**

```ts
const INITIAL_VISIBLE_TOP_LEVEL_REPLIES = 30;
const REPLY_RENDER_BATCH_SIZE = 30;
```

```ts
const sentinelRef = useRef<HTMLDivElement | null>(null);
const [visibleTopLevelCount, setVisibleTopLevelCount] = useState(
  INITIAL_VISIBLE_TOP_LEVEL_REPLIES,
);
```

- [ ] **Step 2: 切換排序或 pushes 更新時重設 visible count**

排序 key、direction 或 `pushes` 更新時，同步把 `visibleTopLevelCount` 設回 30。

- [ ] **Step 3: 渲染 visibleTopLevel**

```ts
const visibleTopLevel = sortedTopLevel.slice(0, visibleTopLevelCount);
const hasMoreTopLevel = visibleTopLevel.length < sortedTopLevel.length;
```

- [ ] **Step 4: 加入 IntersectionObserver**

在 sentinel 進入 viewport 且 `hasMoreTopLevel` 為 true 時增加批次：

```ts
useEffect(() => {
  if (!hasMoreTopLevel) return;
  if (typeof IntersectionObserver === "undefined") return;

  const target = sentinelRef.current;
  if (!target) return;

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    setVisibleTopLevelCount((current) =>
      Math.min(current + renderBatchSize, sortedTopLevel.length),
    );
  });

  observer.observe(target);

  return () => {
    observer.disconnect();
  };
}, [hasMoreTopLevel, renderBatchSize, sortedTopLevel.length]);
```

- [ ] **Step 5: 加入狀態文字與 fallback 按鈕**

輔助文字：

```txt
已顯示 X / Y 則第一層回覆
```

fallback 按鈕文案：

```txt
顯示更多回覆
```

按鈕只在 `IntersectionObserver` 不存在且 `hasMoreTopLevel` 時顯示。

- [ ] **Step 6: 測試 lazy rendering**

因預設 30 筆不容易測，建議讓 `PushThread` 接 optional props：

```ts
initialVisibleTopLevelCount?: number;
renderBatchSize?: number;
```

這兩個 props 只為測試與未來調校使用，不在一般呼叫端傳入。

測試用 `initialVisibleTopLevelCount={2}` 驗證第 3 筆 top-level 初始不在 HTML 中。

### Task 4: 加入手動重新整理新回文

**Files:**

- Modify: `src/hooks/useArticle.ts`
- Modify: `src/components/Article.tsx`
- Modify: `src/components/PushThread.tsx`
- Test: `src/components/__tests__/PushThread.test.tsx`

- [ ] **Step 1: 擴充 `UseArticleReturn`**

在 `src/hooks/useArticle.ts` 加入：

```ts
export interface UseArticleReturn {
  article: ArticleData | null;
  loading: boolean;
  reloading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}
```

- [ ] **Step 2: 抽出 `loadArticle`**

`loadArticle` 接收 mode，初次載入清空 article，手動 reload 不清空既有 article：

```ts
type LoadMode = "initial" | "reload";
```

```ts
const loadArticle = useCallback(
  async (mode: LoadMode) => {
    if (pttState !== "ready" || !client || !boardName || articleIndex <= 0) {
      return;
    }

    if (mode === "initial") {
      setLoading(true);
      setArticle(null);
    } else {
      setReloading(true);
    }
    setError(null);

    try {
      const next = await client.getArticle(boardName, articleIndex);
      if (!next) {
        setError("無法載入文章");
        return;
      }
      setArticle(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "無法載入文章");
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setReloading(false);
      }
    }
  },
  [articleIndex, boardName, client, pttState],
);
```

實作時仍需保留現有 `cancelled` 防護，避免 component unmount 後 set state。

- [ ] **Step 3: 在 `Article` 傳 refresh props**

```tsx
<PushThread
  pushes={article.pushes}
  score={article.score}
  onRefresh={reload}
  refreshing={reloading}
/>
```

- [ ] **Step 4: 在 `PushThread` 顯示重新整理按鈕**

Props：

```ts
interface PushThreadProps {
  pushes: AggregatedPush[];
  score: number;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
  initialVisibleTopLevelCount?: number;
  renderBatchSize?: number;
}
```

按鈕文案：

```txt
重新整理回文
```

`refreshing === true` 時文案：

```txt
更新中...
```

- [ ] **Step 5: 測試 refresh UI**

用 SSR 測試至少確認按鈕文案存在：

```tsx
<PushThread score={0} pushes={[]} onRefresh={() => undefined} />
```

Expected: markup contains `重新整理回文`.

互動觸發可以後續用 browser verification 或 React Testing Library 補。

### Task 5: 文件與手動驗證

**Files:**

- Modify: `implement.md`
- Optional Modify: `src/App.tsx`

- [ ] **Step 1: 更新 `implement.md`**

新增 high-level 條目，記錄目標 4 已完成能力與 lazy rendering 策略。

- [ ] **Step 2: 視需要補 preview data**

若真站驗證不方便，可在 `MOCK_PUSHES` 增加 4-6 筆不同 score / anchorOrder 的第一層回文。

- [ ] **Step 3: 跑完整驗證**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass and production build succeeds.

- [ ] **Step 4: 執行 UI 測試項目**

依下方「UI 測試項目」逐項驗證，至少覆蓋 preview article 與一篇真站熱門文章。

## UI 測試項目

這份清單用於實作完成後的瀏覽器驗證。若 preview data 不足以覆蓋，先補 `src/App.tsx` 的 `MOCK_PUSHES`，讓 `?preview=article` 有足夠多的第一層回文、巢狀回覆、正分、負分與同分案例。

### 1. 基本載入與預設狀態

- [ ] 開啟 `?preview=article`，文章 header、正文、文章編輯紀錄與討論串都正常顯示。
- [ ] 討論串標題顯示文章總分、第一層回覆總數，以及 `已顯示 X / Y 則第一層回覆`。
- [ ] 預設排序顯示為 `時間` + `舊到新`。
- [ ] 預設第一層回文順序等同原始 `anchorOrder` 遞增。
- [ ] 子回覆出現在父回文底下，不被提升到第一層。
- [ ] 手機寬度下排序按鈕、重新整理按鈕、計數文字不溢出、不遮住內容。

### 2. 時間排序

- [ ] 點時間方向切換後，第一層回文改為 `新到舊`。
- [ ] 再點一次方向切換後，回到 `舊到新`。
- [ ] 時間排序使用原文順序；同一分鐘或缺少 `time` 的回文仍依 `anchorOrder` 穩定排序。
- [ ] 切換時間方向時，children 仍維持父回文內的 `anchorOrder` 遞增。
- [ ] 切換時間方向不改變每則回文顯示的 `sourceFloors` 相關語意；`回x樓` 掛靠結果不變。

### 3. 推噓分排序

- [ ] 點 `推噓分` 後，排序 key 切到 score。
- [ ] `高到低` 顯示為 `+10, +2, 0, -1` 這類順序。
- [ ] `低到高` 顯示為 `-5, 0, +1, +8` 這類順序。
- [ ] 同分時，第一層回文維持原始 `anchorOrder` 遞增，不因 `高到低` 變成新到舊。
- [ ] 0 分回文正常參與排序，不缺席。
- [ ] 負分回文正常參與排序，且 badge 顯示仍是 `噓 -N`。
- [ ] UI 文案使用「推噓分」，畫面上不出現「推文數」作為排序文案。

### 4. 巢狀與特殊節點

- [ ] 第一層排序後，巢狀 children 仍跟著原本父回文移動。
- [ ] 第二層以上回覆仍完整顯示。
- [ ] 作者編輯節點 `編` 仍掛在正確父回文底下。
- [ ] 作者編輯節點不參與第一層排序，也不影響父回文 `score`。
- [ ] OP 標籤、IP 顯示、推 / 噓 / → badge 在排序後仍保留。

### 5. Scroll lazy rendering

- [ ] 熱門文章或 preview 大量 mock replies 初始只渲染第一批第一層回文，不一次顯示全部。
- [ ] 往討論串底部捲動，sentinel 進入 viewport 後自動顯示下一批第一層回文。
- [ ] 多次捲到底部可以持續增加，直到 `已顯示 Y / Y 則第一層回覆`。
- [ ] 全部顯示後不再重複觸發增加，也不出現空白 sentinel 區塊造成跳動。
- [ ] 切換排序 key 或 direction 後，顯示數量重設為初始批次。
- [ ] 切換排序後再次捲到底部，仍能繼續自動載入下一批。
- [ ] 若測試環境停用 `IntersectionObserver`，fallback「顯示更多回覆」按鈕能顯示並手動增加批次。

### 6. 重新整理回文

- [ ] 有 `onRefresh` 時顯示「重新整理回文」按鈕。
- [ ] 點重新整理後按鈕變成 `更新中...` 並 disabled。
- [ ] 重新整理成功後文章資料更新，排序設定保留。
- [ ] 重新整理成功後 visible count 重設為初始批次。
- [ ] 重新整理失敗時不要清空目前已顯示文章；畫面仍保留舊內容並顯示錯誤狀態。
- [ ] 重新整理期間再次點擊不會發出第二個 reload。
- [ ] 在沒有登入或 client 不 ready 的狀態下，不應讓重新整理造成畫面 crash。

### 7. Edge cases

- [ ] `pushes` 為空時，討論串顯示 0 則第一層回覆，不顯示排序後的空白卡片。
- [ ] 只有 children、沒有合法第一層父節點的異常資料，不應讓畫面 crash；孤兒節點不應出現在第一層排序結果中。
- [ ] 第一層回文數少於初始批次時，不顯示 sentinel loading 狀態或 fallback 按鈕。
- [ ] 所有第一層回文 score 都相同時，切到推噓分排序後順序仍為原始時間序。
- [ ] score 包含正分、0、負分時，asc / desc 都符合定義。
- [ ] `anchorOrder` 相同時，用 `id` fallback，排序結果穩定且不隨 render 變動。
- [ ] `time` 空字串或 malformed 不影響排序，因為排序不使用 `time`。
- [ ] 很長作者 id、很長 IP list、很長單字或 URL 不會撐破手機版 layout。
- [ ] 快速連續切換排序按鈕時，不產生重複 key warning、閃爍消失或 children 掛錯父層。
- [ ] 從一篇文章切到另一篇文章後，排序狀態回到預設，visible count 也回到初始批次。

## 實作完成標準

1. 預設排序和目前閱讀順序一致。
2. 使用者可切換時間 / 推噓分排序。
3. 使用者可切換遞增 / 遞減方向。
4. 排序只影響第一層聚合回文。
5. 子回覆仍維持原始 `anchorOrder`。
6. `replyTo`、`sourceFloors`、`floorNumber` 不因排序改變。
7. 熱門文章不一次渲染全部第一層回文，至少有第一版 lazy rendering。
8. 測試覆蓋排序 helper 與既有 nested rendering 行為。
9. 滾動到討論串底部時會自動渲染更多已取得的第一層回文。
10. 使用者可以手動重新整理回文，重新抓取文章以取得新回文。
