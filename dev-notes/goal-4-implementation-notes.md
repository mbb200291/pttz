# 目標 4 回文排序實作筆記

這份文件記錄目標 4 回文排序與 lazy rendering 這波實作的主要決策、踩坑與目前狀態。規則設計本身以 [`goal-4-reply-sort-implementation-plan.md`](goal-4-reply-sort-implementation-plan.md) 為準；本文件偏向實作摘要與 debug 紀錄。

---

## 目前完成狀態

已完成：

- 第一層聚合回文可依時間（`anchorOrder`）或推噓分（`score`）排序
- 遞增 / 遞減方向切換
- children 排序固定使用 `anchorOrder` 遞增，不受第一層排序影響
- 切換排序 key 或方向時，visible count 自動重設為初始批次
- scroll sentinel lazy rendering：初始顯示 30 則，捲到底部自動增加 30 則
- 無 `IntersectionObserver` 環境提供「顯示更多回覆」fallback 按鈕
- 手動「重新整理回文」按鈕，重新向 PTT 抓取整篇文章，不清空舊內容
- `useArticle` 新增 `reload` / `reloading`，初次載入與手動重整使用不同 loading flag
- UI 顯示「已顯示 X / Y 則第一層回覆」

主要改動範圍：

- `src/components/PushThread.tsx`：排序 state、sorting helper、lazy rendering、控制列 UI
- `src/hooks/useArticle.ts`：`reload` / `reloading`
- `src/components/Article.tsx`：傳 `onRefresh` / `refreshing` 給 `PushThread`

---

## 排序設計摘要

### 排序 key 選擇

時間排序使用 `anchorOrder`，不使用 `time` 字串。

原因：

- `time` 格式為 `MM/DD HH:mm`，不含年份
- 跨年文章、同分鐘多筆、parser fallback 等情況下，字串排序不穩定
- `anchorOrder` 是 adapter 保留的原文位置，相對順序與 PTT 原始閱讀順序一致

推噓分排序使用 `score`。

`score` 語意為「此聚合回文收到的巢狀推噓淨分」：

- 巢狀 `push` = +1
- 巢狀 `boo` = -1
- `→` 與 `edit` node = 0

UI 文案使用「推噓分」，避免使用者誤解為「收到幾則巢狀回覆」。

### 預設排序

```ts
const DEFAULT_REPLY_SORT: ReplySortState = {
  key: "time",
  direction: "asc",
};
```

時間舊到新，等同 PTT 原始閱讀順序，也等同切換前的既有行為。

切換到 score 時，預設方向自動改為 `desc`（高分到低分）。回到 time 時，預設方向自動改回 `asc`。

### tie-breaker

所有排序均使用三層 tie-breaker：

1. 主排序：`anchorOrder` 或 `score`
2. 次要：永遠用 `anchorOrder` 遞增（不跟隨方向）
3. 最後 fallback：`id.localeCompare(...)`

同分時維持原始時間序，避免列表切換時不必要跳動。

---

## Lazy Rendering 設計

採 UI-level incremental rendering，不改資料層或 adapter。

- 資料層仍一次取得完整 `pushes`
- `PushThread` 僅渲染排序後前 N 個第一層節點
- 使用 `IntersectionObserver` 監聽 sentinel div，捲到底部自動增加批次

常數：

```ts
const INITIAL_VISIBLE_TOP_LEVEL_REPLIES = 30;
const REPLY_RENDER_BATCH_SIZE = 30;
```

切換排序或收到新 pushes 時，`visibleTopLevelCount` 重設為初始值，避免切換後一次渲染大量節點。

無 `IntersectionObserver` 環境（SSR / 舊瀏覽器）提供「顯示更多回覆」按鈕 fallback。

目前 lazy loading 只降低 render 數量，不影響 `getArticle()` 自身的讀取耗時。

---

## 手動重新整理設計

「重新整理回文」與 scroll lazy loading 是兩件不同的事：

- scroll lazy loading：已取得的 `pushes` 分批渲染，不打 PTT
- 重新整理回文：重新呼叫 `client.getArticle()`，整篇文章重新讀取與聚合

`useArticle` 拆出兩個 loading flag：

- `loading`：初次載入，會清空 `article`
- `reloading`：手動重整，失敗時保留現有 `article`，不清空畫面

重整中按鈕顯示「更新中...」並 disabled，完成後 `visibleTopLevelCount` 重設。

---

## 踩坑

### setSortKey 切換 direction 預設值

切換 key 時需同時決定新方向。若直接 setSort 覆蓋整個 state，切換到 score 時方向會沿用上一次的值。

目前做法：

```ts
function setSortKey(key: ReplySortKey) {
  setSort((current) => {
    if (current.key === key) return current;
    return { key, direction: key === "score" ? "desc" : "asc" };
  });
}
```

切換到同一個 key 時直接 return current，避免不必要 re-render。

### IntersectionObserver effect 依賴

sentinel ref 的 observer 需在 `hasMoreTopLevel` 或 `sortedTopLevel.length` 改變時重新設置，否則捲到底部後 observer 不會再觸發，或批次計算會用到舊的 `sortedTopLevel.length`。

目前 effect 依賴陣列：

```ts
[hasMoreTopLevel, renderBatchSize, sortedTopLevel.length, supportsIntersectionObserver]
```

每次 `hasMoreTopLevel` 變為 false 時 observer 自動斷開，避免無效監聽。

### 測試中 IntersectionObserver 不存在

Vitest / jsdom 環境沒有 `IntersectionObserver`，需 mock 或改用 fallback 路徑測試。

目前 `PushThread.test.tsx` 採用靜態 markup 驗證排序與初始批次，未做 observer 互動測試。

---

## 已驗證測試

目前這波主要覆蓋：

- `PushThread.test.tsx`：10 個 case，含時間排序、推噓分排序、children 不受第一層排序影響、lazy rendering 初始批次

常用驗證命令：

```bash
pnpm vitest run src/components/__tests__/PushThread.test.tsx
pnpm exec vite build
```

---

## 目前仍需注意

- score 排序依賴巢狀回覆存在；若文章所有回文都在第一層，score 全為 0，排序結果等同時間排序
- 目前沒有「跳到第 x 樓」功能；若未來加入錨點跳轉，需讓 lazy rendering 能自動展開至目標節點
- children lazy expand / 折疊尚未實作，某個第一層節點底下若有大量子回覆仍會一次渲染
