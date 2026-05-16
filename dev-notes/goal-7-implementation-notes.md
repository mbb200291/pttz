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
   const { client, pttState } = usePttSocketStore((s) => ({
     client: s.client,
     pttState: s.pttState,
   }));
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

---

## Bug #7：看板進入命令格式錯誤導致無法發文和讀取文章

**現象：**
- 發文時：「無法進入看板 test」
- 讀取文章列表時：同樣出現「無法進入看板」錯誤
- 影響範圍廣，所有需要進入看板的操作都失敗

**根因：**
`ensureNormalBoardView()` 函式（行 1147-1155）的看板進入命令格式完全錯誤：

```typescript
// ❌ 錯誤的原始代碼
await bot.send(`s${boardName}\r ${PTT_KEY_HOME}${PTT_KEY_END}`);
```

問題：
1. `${PTT_KEY_HOME}${PTT_KEY_END}` 不應該作為字面字符串拼接
2. 終端控制碼被當作普通文字發送，導致命令格式錯誤
3. PTT 無法識別看板名，導致進入失敗

**修正方案：**

改正命令格式 + 增加重試邏輯：

```typescript
// ✅ 修正後的代碼
await bot.send(`s${boardName}\r`);  // 正確的命令格式
await sleep(400);  // 增加延遲到 400ms

// 驗證看板進入 - 重試多次
for (let attempt = 0; attempt < 3; attempt++) {
  const currentBoard = extractCurrentBoardName(readVisibleScreen(bot));
  if (currentBoard?.toLowerCase() === boardName.toLowerCase()) {
    return true;
  }
  if (attempt < 2) {
    await sleep(200);  // 重試間隔
  }
}

return false;
```

**改進重點：**

1. **移除錯誤的終端控制碼** - 直接發送 `s${boardName}\r`
2. **增加延遲** - 從 150ms → 400ms，給看板加載充足時間
3. **添加重試邏輯** - 重試 3 次，每次間隔 200ms，提高成功率
4. **明確驗證** - 檢查 `extractCurrentBoardName` 是否返回正確的看板名

**第二波改進（看板進入仍失敗）：**

發現即使修正命令格式，仍有進入失敗的情況。進行了更激進的改進：

```typescript
// 增加：
// 1. 初始延遲從 400ms → 600ms
// 2. 重試次數從 3 次 → 5 次  
// 3. 重試策略：先按 q 返回，再重新進入
// 4. 遞增延遲：300ms + (attempt * 100ms)

for (let attempt = 0; attempt < 5; attempt++) {
  const screen = readVisibleScreen(bot);
  const currentBoard = extractCurrentBoardName(screen);
  if (currentBoard?.toLowerCase() === boardName.toLowerCase()) {
    return true;
  }
  if (attempt < 4) {
    if (attempt > 0) {
      // 重試時先按 q 返回，再進入
      await bot.send?.("q");
      await sleep(300);
      await bot.send(`s${boardName}\\r`);
    }
    await sleep(300 + attempt * 100);  // 遞增延遲
  }
}
```

**驗證：**

- ✅ `npm run build` 通過
- ✅ `npm run test` 通過：19 files / 221 tests
- ✅ 更激進的重試邏輯應能大幅提高看板進入成功率

## 版本歷史

| 日期       | 版本   | 重點                                                           |
| ---------- | ------ | -------------------------------------------------------------- |
| 2026-05-14 | v0.7.4 | 實站驗證 Test 發文 / 自文回文，修正文章回覆後未自動重載問題     |
| 2026-05-14 | v0.7.3 | 修正從 PTT 看板列表頁進入任意看板的 fallback 流程              |
| 2026-05-03 | v0.7.2 | 修復看板進入命令格式，新增重試邏輯                             |
| 2026-05-03 | v0.7.1 | 修復連續載入 bug，優化 Zustand selector 使用                   |
| 2026-04-29 | v0.7.0 | Goal 7 初始 push：VotePair、usePttActions、Composer 等 UI 元件 |

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

改用 Zustand selector 只訂閱需要的值：

```typescript
// Before
const { client, pttState } = usePttSocketStore();

// After
const client = usePttSocketStore((s) => s.client);
const pttState = usePttSocketStore((s) => s.pttState);
```

這樣 hooks 只在 `client` 或 `pttState` 實際改變時重新渲染，避免不必要的 effect 重新執行。

---

## Bug #8：從 PTT 看板列表頁進板 fallback 失敗

**現象：**

實際登入後首頁會先嘗試同步我的最愛。`ptt-client.getFavorite()` 在特定我的最愛頁面會丟出
`RangeError: Invalid count value: -1`，但 bot terminal 仍停在 PTT 的「看板列表」畫面。
此時從首頁點選或輸入 `Tech_Job` 會顯示「無法進入看板 Tech_Job」。

**根因：**

`ensureNormalBoardView()` 先呼叫 `bot.enterBoardByName(boardName)`。當 bot 位於 `【看板列表】`
而非主選單或一般看板列表時，`ptt-client` 內部讀不到 `currentBoardname`，會觸發
`Cannot read properties of undefined (reading 'toLowerCase')`。

adapter 的 fallback 原本直接送 `s${boardName}\r`。但在 PTT「看板列表」頁，`s` 並不是主選單的
Search board 指令；畫面提示是 `[/]搜尋`。因此 fallback 仍停在看板列表頁，無法進入目標看板。

**修正：**

1. 新增 `isBoardDirectoryScreen()` 判斷 `【看板列表】` 且有 `[/]搜尋` 提示。
2. 位於看板列表頁時，先嘗試 `/` 搜尋目標看板並按 `r` 閱讀。
3. 若看板列表搜尋沒有成功進入目標看板，先呼叫 `enterIndex()` 回主索引。
4. 回主索引後再送標準進板序列 `s${boardName}\r \x1b[1~\x1b[4~`，並用
   `extractCurrentBoardName()` + `isBoardListScreen()` 驗證狀態。

**測試：**

新增 adapter regression tests：

- 從 PTT 看板列表頁搜尋命中時可進入 `Tech_Job`
- 看板列表搜尋未成功時會先回主索引再手動進板

**實站驗證：**

修正後在實際 PTT session 依序進入：

- `Tech_Job`
- `Stock`
- `C_Chat`
- `Gossiping`
- `Test`

皆可正常載入文章列表。

---

## Bug #9：作者在自己文章下方回文後 UI 未立即刷新

**現象：**

在 `Test` 板發文成功後，於該篇文章使用 UI 的「回覆此文」送出回文，Composer 會關閉，但文章下方仍顯示
`0 則第一層回覆`。使用者若再次送出，實際上 PTT 會接受多次回文，造成重複留言。

**根因：**

`Article.tsx` 的 `handleComposerSubmit()` 在 `actions.replyToArticle()` 回傳 `{ ok: true }` 後只關閉
Composer，沒有重新抓取文章內容。PTT 寫入成功後，前端仍保留舊的 article state。

同時，作者對自己的文章回覆時，PTT terminal 會顯示：

```text
作者本人, 使用 → 加註方式
→ MBB200291:
```

這不是一般推 / 噓選單，而是強制使用 `→` 加註。adapter 的寫入序列仍可成功送出，但 UI 需要重新讀取
文章才能看到新增的 neutral push。

**修正：**

`Article.tsx` 在回文成功後：

1. 關閉 Composer
2. 呼叫 `liveReload()` 重新抓取文章

```typescript
void actions.replyToArticle(payload.body, payload.pushType, boardName).then((result) => {
  if (!result.ok) return;
  setComposer(null);
  void liveReload();
});
```

**實站驗證：**

在 `Test` 板發表文章 `pttzzz 測試 2218` 後，確認文章列表出現：

```text
#365 pttzzz 測試 2218 MBB200291
```

接著在該篇下方送出 `→` 回文，重新打開文章後確認回文已出現在下方。測試過程中因 UI 未刷新先重複送出，
最後文章顯示 3 則 `→` 回文。此現象確認了 bug 的風險，也驗證修正方向為「成功後必須重新載入文章」。

---

## Bug #2：首頁熱門看板顯示假在線人數

**現象：**
`BoardInput.tsx` 內原本直接寫死熱門看板與在線人數：

```typescript
{ name: "Gossiping", zh: "八卦", online: "28,420" }
```

這會讓 UI 看起來像真實熱門看板，但數值其實不是從 PTT 取得。

**根因：**
首頁 UI 只有靜態 `POPULAR_BOARDS`，沒有 adapter/hook 層資料來源，也沒有載入失敗時的誠實 fallback。

**修正：**

- `BoardInput` 改收 `popularBoards` 與 `popularBoardsLoading`
- `PttAdapter` 新增 `listHotBoards()`
- `useHotBoards()` 在登入 ready 後載入 PTT hot board list
- 無 live data 時顯示「常用看板」與「即時人數待同步」，不再顯示假在線數

**踩坑：**

- Preview 模式若直接使用 `pttState === "ready"`，可能會誤觸 hot board 查詢；後續改成 `useHotBoards(!isPreview)`
- adapter 需要明確檢查登入狀態，所以補了 `waitUntilLoggedIn()`，避免未登入時讀 hot board

**驗證：**

- `BoardInput` 測試覆蓋 live data 與 no-live-data fallback
- `adapter` 測試覆蓋 hot board row mapping
- `npm run build` 通過
- `npm run test` 通過

---

## Bug #3：發文分類靠硬編碼 map，無法涵蓋任意看板

**現象：**
`boardCategories.ts` 只列出少數看板：

```typescript
gossiping: ["問卦", "新聞", "爆卦", "政治", "協尋", "公告"]
stock: ["標的", "新聞", "請益", "心得", "閒聊", "公告"]
```

如果使用者進入不在 map 內的看板，compose 頁無法知道該看板實際允許的分類。

**根因：**
分類來源順序是「文章列表觀察到的 `[分類]`」再退到硬編碼 map。這不是 PTT 發文頁的真實規則，而且 map 會過期或不完整。

**修正：**

- 移除硬編碼 board category fallback
- `boardCategories.ts` 只做 normalize，不再根據 board name 自行產生分類
- `PttAdapter` 新增 `getPostCategoryOptions(boardName)`
- 進入 compose view 後，由 `App.tsx` 查該看板實際發文提示並 cache 結果
- adapter 查詢流程只做讀取提示：
  1. 進入看板
  2. 送 `Ctrl-P`
  3. 解析提示畫面中的分類
  4. 送 `Ctrl-C` 取消

**安全限制：**
此流程只讀取分類提示，不送出標題、內文、回文、發文、投票或編輯操作。

**踩坑：**

- `AppView` 是 union type，不能在 effect dependency 直接使用 `view.board`，因為 `home` view 沒有 `board` 欄位；修正為先萃取 `composeBoard`
- 若保留硬編碼 fallback，測試會通過但行為仍不符合需求；因此新增測試明確要求 `resolveBoardCategoryOptions("Gossiping")` 回傳空陣列
- parser 需支援 PTT 提示中常見的 `[分類]` 格式，並避免把「請選擇」「取消」等提示文字當分類

**驗證：**

- `parsePostCategoryOptions()` 可從模擬發文提示解析 `["問題", "情報", "心得", "閒聊"]`
- `resolveBoardCategoryOptions()` 不再從硬編碼看板名產生分類
- `npm run build` 通過
- `npm run test` 通過：19 files / 218 tests

---

## Bug #4：發文 / 回文 / 推噓 UI 可操作但沒有送到 PTT

**現象：**
Goal 7 UI 中的發文、回文、推噓按鈕可操作，modal 也會關閉或樂觀更新，但 PTT 端沒有實際新增文章或推文。

**根因：**
`usePttActions` 仍是 stub：

```typescript
await delay();
return { ok: true };
```

因此 UI 以為操作成功，但沒有呼叫 adapter，也沒有送任何 PTT 指令。

**修正：**

- `PttAdapter` 新增寫入介面：
  - `replyToArticle(content, pushType, boardName?)`
  - `replyToPush(floor, content, pushType, boardName?)`
  - `voteArticle(floor, kind, boardName?)`
  - `votePush(floor, kind, boardName?)`
  - `postArticle(board, category, title, body)`
- `usePttActions` 改為呼叫 adapter，沒有 client 時回 `{ ok: false }`
- `Article.tsx` 的回文 composer submit 改走 `actions.replyToArticle(...)`
- 推噓按鈕改為 adapter 回傳成功後才更新本地 vote state
- `App.tsx` 的 `ComposeScreen` submit 改走 `actions.postArticle(...)`

**踩坑：**

1. **PTT 推文送出有確認 prompt 延遲**
   - 輸入推文內容後，不一定立即出現 `確定[y/N]`
   - 原本等待時間太短，導致沒有送出 `y`
   - 修正為輪詢等待 `確定 / 是否 / 送出 / 儲存` prompt，看到後才送 `y`

2. **送出後可能出現「請按任意鍵繼續」**
   - 若不處理，terminal 會停在中介畫面
   - 修正為看到「請按任意鍵繼續」後送 Enter

3. **按任意鍵後 terminal 可能不在原看板**
   - 實測時送出後曾返回非目標看板列表
   - 修正為寫入 action 帶入 `boardName`，收尾後呼叫 `ensureNormalBoardView(bot, boardName)` 導回原看板

4. **Test 板作者本人推文會被 PTT 強制改成 `→` 加註**
   - PTT 顯示「作者本人, 使用 → 加註方式」
   - UI 選推時，PTT 端仍可能依看板/文章規則降級成 `→`

**實站驗證限制：**

- 僅在 `Test` 板指定文章操作
- 實測文章：`[測試] 測試z`
- 實測結果：文章內出現測試加註回文
- 未實測發文、編輯、非 Test 看板、非指定文章

**驗證：**

- `npm run build` 通過
- `npm run test` 通過：19 files / 221 tests

---

## Bug #5：純投票推文被顯示為獨立回文

**現象：**
根據 spec.md 規則，純投票（「推X樓」、「噓X樓」）應視為投票操作，不應在 UI 中顯示為獨立回文。但目前實作會將這些純投票作為獨立推文出現在回文列表中。

**根因：**
`groupPushes()` 正確地將純投票識別為獨立群組（避免與其他回文聚合），但這些純投票群組被合併成 `AggregatedPush` 後，仍被納入最終回傳的 `threadPushes` 陣列，導致 UI 展示。

**修正：**
在 `aggregatePushes()` 的最後一步（Step 5）添加過濾邏輯：

```typescript
// Step 5：過濾掉純投票推文（不顯示為獨立回文）
const displayedPushes = threadPushes.filter((push) => {
  // 編輯記錄類型保留
  if (push.type === "edit") return true;
  // 檢查是否為純投票推文
  return !isPureVote(push.content);
});

return {
  pushes: displayedPushes,
  articleNotes: articleEditRecords,
};
```

**實作細節：**

1. 純投票的投票記錄仍在 Step 2b 時被完整記錄在目標推文的 `pushVoters` / `booVoters` 陣列中
2. 過濾只影響最終顯示的 `displayedPushes`，不影響投票計數邏輯
3. 編輯記錄（type="edit"）始終保留，不被過濾

**規則釐清：**

根據 `dev-notes/reply-handling-rule.md`：

- 「推X樓」← 純投票，不顯示
- 「推X樓 其他內容」← 帶內容的回覆，顯示為嵌套回文
- 「回X樓：...」← 嵌套回覆，顯示
- 「回X樓：推X樓 其他」← 嵌套回覆，顯示（不視為純投票）

**驗證：**

- ✅ `npm run test -- pushAggregator.test.ts` 通過：43 tests
- ✅ `npm run test` 通過：19 files / 221 tests
- ✅ 投票記錄邏輯保持不變（Step 2b 在過濾前執行）

---

## Bug #6：樓層號以 0 開始而非 1

**現象：**
UI 顯示的推文樓層號從 0 開始，但 PTT 樓層應以 1 開始。

**根因：**
`aggregatePushes()` 的 Step 3 中，初始化 `let floor = 0;` 導致第一層非嵌套推文的樓層號為 0, 1, 2, ...

**修正：**
將初始化改為 `let floor = 1;`，使樓層號正確從 1 開始。

```typescript
// Step 3：偵測嵌套 → 建立 floorNumber 映射（第一層樓號）
const topLevel: AggregatedPush[] = [];
let floor = 1;  // ← 改為 1
```

**驗證：**

- ✅ `npm run test` 通過：19 files / 221 tests
- ✅ `npm run build` 通過
