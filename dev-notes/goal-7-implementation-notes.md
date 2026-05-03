# Goal 7 實作筆記：發文、回文、投票、上傳圖片

## Bug 踩坑記錄

### Bug #1：連續載入問題（「一直跳動載入」）

**現象：**
打開看板（例如 Gossiping）時，文章列表不斷顯示 loading 狀態，同時伴隨文章列表的跳動/重新渲染。

**診斷過程：**
1. 初步懷疑是 `ArticleList` 的 IntersectionObserver 機制有問題
2. 檢查 `loadMore` 的依賴陣列，發現 `loadMore` 包含 `articles` 依賴，每當文章更新時就會重新建立
3. 進一步追溯發現，`useBoard` 和 `useArticle` 中對 Zustand store 的取值有問題

**根因：**
```typescript
// useBoard.ts (line 147)
const { client, pttState } = usePttSocketStore();
```

這種不使用 selector 的寫法，會讓 hook 訂閱整個 store 的變化。當 store 的任何欄位改變（例如 `wsStatus`、`loginError`、`recentBuffer` 等），整個 hook 都會重新渲染，進而觸發 effect 重新執行。

流程圖：
```
store 某欄位變化 (e.g., wsStatus)
  ↓
usePttSocketStore() 重新返回 store
  ↓
useBoard hook 重新渲染
  ↓
useBoard effect 依賴陣列檢查，fetchArticles 被重新建立
  ↓
effect 重新執行，setLoading(true) 再次被呼叫
  ↓
fetch 重新開始 → 連續載入現象
```

**修正方案：**
使用 Zustand selector 只訂閱實際需要的欄位：

```typescript
// useBoard.ts (line 147-148)
const client = usePttSocketStore((s) => s.client);
const pttState = usePttSocketStore((s) => s.pttState);
```

同樣修正也應用於 `useArticle.ts` (line 126-127)。

**驗證：**
- ✅ 所有 218 項測試通過
- ✅ TypeScript build 無錯誤
- ✅ Preview board 頁面不再出現連續載入
- ✅ 瀏覽器 console 無相關錯誤

**相關commit：**
```
4136ef8: fix: use Zustand selectors in useBoard and useArticle to prevent continuous loading
```

---

## Feature Refining 紀錄

### Refining #1：useBoard dependency array 優化

**改進：**
通過使用 selector，讓 `useBoard` 的 effect dependency 更明確。
原本 `fetchArticles` 會因為 `client` 或 `filter` 變化而重新建立，
現在 `client` 使用 selector 後，只有真正的值變化時才會重新建立。

**效果：**
- 減少不必要的 effect 重新執行
- 提高頁面整體反應性
- 避免 loading 狀態的不穩定

---

## 其他實作筆記

### 關於 Zustand 的 selector 最佳實踐

1. **避免在 component 中直接取整個 store**
   ```typescript
   // ❌ Bad
   const state = usePttSocketStore();
   
   // ✅ Good
   const client = usePttSocketStore((s) => s.client);
   const pttState = usePttSocketStore((s) => s.pttState);
   ```

2. **Selector 會自動做 shallow equality 檢查**
   - 只有返回值改變時，component 才會重新渲染
   - 這樣可以避免 store 中其他欄位變化造成的副作用

3. **對於複數欄位，可以用物件 selector**
   ```typescript
   const { client, pttState } = usePttSocketStore(
     (s) => ({ client: s.client, pttState: s.pttState })
   );
   ```
   但在這個案例中，分開使用 selector 會更清晰

---

## 下一步實作重點

1. **Task 3-7 逐步實施：** Composer、ComposeScreen、PushThread 強化等
2. **整合 Imgur API：** Task 3b 需要真實上傳圖片功能
3. **PTT adapter 寫入整合：** `usePttActions` 從 stub 換成真實呼叫

---

## 測試覆蓋範圍

- ✅ useBoard 單元測試
- ✅ useArticle 單元測試
- ✅ ArticleList 組件測試
- ✅ Article 組件測試
- ✅ PushThread 組件測試
- ✅ VotePair 組件測試

所有測試均已執行並通過，無回歸問題。

---

## 版本歷史

| 日期 | 版本 | 重點 |
|---|---|---|
| 2026-05-03 | v0.7.1 | 修復連續載入 bug，優化 Zustand selector 使用 |
| 2026-04-29 | v0.7.0 | Goal 7 初始 push：VotePair、usePttActions、Composer 等 UI 元件 |
