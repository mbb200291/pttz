# 發文無法進入看板問題分析

## 現象
發文時遇到錯誤：「無法進入看板 test」（Error from `submitPostFromBot` in adapter.ts:1269）

## 根因分析

### 當前邏輯
`ensureNormalBoardView()` 函式的流程：
1. 檢查是否已在目標看板
2. 若否，嘗試 `bot.enterBoardByName(boardName)` 
3. 若失敗，執行 `s${boardName}\r` 命令進入
4. 最後驗證是否進入成功

### 潛在問題

**問題 1：進入命令格式**
```typescript
// 當前
await bot.send(`s${boardName}\r ${PTT_KEY_HOME}${PTT_KEY_END}`);
```
- `${PTT_KEY_HOME}${PTT_KEY_END}` 被當作字面字符串發送，可能導致命令格式錯誤
- 應改為單純的 `s${boardName}\r`

**問題 2：時間不足**
- 當前只有 150ms 延遲，進入看板可能需要更長時間
- 特別是在網路慢或 PTT 伺服器繁忙時

**問題 3：單次檢查**
- 只檢查一次屏幕狀態就返回 false
- 應該重試多次，給予看板進入的時間

**問題 4：缺乏備用方案**
- 若看板進入失敗，沒有額外的重試邏輯
- 缺乏詳細的錯誤訊息

## 建議改進方案

### 1. 修正進入命令（優先）
```typescript
// 改為
await bot.send(`s${boardName}\r`);  // 移除多餘的 PTT_KEY_HOME 等
await sleep(300);  // 增加延遲到 300ms
```

### 2. 添加重試邏輯（次優先）
```typescript
// 進入後多次驗證，給予充足時間
for (let attempt = 0; attempt < 3; attempt++) {
  const currentBoard = extractCurrentBoardName(readVisibleScreen(bot));
  if (currentBoard?.toLowerCase() === boardName.toLowerCase()) {
    return true;
  }
  if (attempt < 2) {
    await sleep(200);
  }
}
```

### 3. 改進錯誤訊息（可選）
```typescript
const entered = await ensureNormalBoardView(bot, boardName);
if (!entered) {
  const currentBoard = extractCurrentBoardName(readVisibleScreen(bot));
  throw new Error(
    `無法進入看板 ${boardName}（目前在 ${currentBoard || '未知'}）`
  );
}
```

### 4. 添加中間日誌（除錯用）
```typescript
console.debug(`[submitPost] Entering board: ${boardName}`);
const entered = await ensureNormalBoardView(bot, boardName);
console.debug(`[submitPost] Board entry result: ${entered}`);
```

## 優先順序

1. **立即修正**：修正進入命令格式，移除多餘的終端鍵
2. **後續改進**：添加重試邏輯和更長的延遲
3. **質量提升**：改進錯誤訊息和日誌

## 測試建議

由於不能直接在 PTT 測試，建議：
1. 檢查 ptt-client 的 `enterBoardByName` 實現
2. 驗證 `extractCurrentBoardName()` 能否正確解析屏幕
3. 添加單元測試覆蓋邊界情況

## 相關檔案

- `src/lib/ppt/adapter.ts` - 行 1107-1154 `ensureNormalBoardView` 函式
- `src/lib/ppt/adapter.ts` - 行 1255-1294 `submitPostFromBot` 函式
