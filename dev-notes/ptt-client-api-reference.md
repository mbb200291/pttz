# ptt-client API 參考

**版本**: 0.9.0  
**倉庫**: https://github.com/kevinptt0323/ptt-client  
**性質**: 低級終端仿真庫，不提供高級業務邏輯

---

## 核心概念

ptt-client 是一個 **WebSocket 終端仿真器**，負責：
- 與 PTT WebSocket (`wss://ws.ptt.cc/bbs`) 連接
- 模擬終端視窗 (80欄 × 24列)
- 發送和接收原始終端資料
- 解析頁面結構（看板、文章、推文等）

**重要**：ptt-client **不知道任何 PTT 業務邏輯**。它只提供原始操作，具體流程需要呼叫端自己實現。

---

## Bot 物件主要方法

### 生命週期

```typescript
// 建立實例
const bot = new Ptt({
  name: "PTT",
  url: "wss://ws.ptt.cc/bbs",
  charset: "big5",
  origin: "app://pcman",              // 必須，PTT 要求此 header
  protocol: "websocket",
  timeout: 40,                         // 命令逾時秒數
  blobSize: 1024,                      // 每次接收的最大位元組數
  preventIdleTimeout: 30,              // 防止伺服器斷線
  terminal: {
    columns: 80,
    rows: 24,
  },
});

// 訂閱事件
bot.on("connect", () => {});           // 已連接
bot.on("disconnect", () => {});        // 已斷開
bot.on("error", (err) => {});          // 出錯
bot.on("redraw", (screen) => {});      // 屏幕更新時收到完整的終端內容（含 ANSI）

// 斷開連接
bot.socket?.disconnect?.();
```

### 基礎終端操作

```typescript
// 發送命令到 PTT（等價於使用者按鍵）
// 返回 Promise<boolean>，成功返回 true
await bot.send("username\r");          // 輸入使用者名稱 + Enter
await bot.send("password\r");          // 輸入密碼 + Enter
await bot.send("\x03");                // Ctrl+C
await bot.send("\x10");                // Ctrl+P（新文章）
await bot.send("\x18");                // Ctrl+X（保存）
await bot.send("y\r");                 // 輸入 y + Enter
await bot.send("\x1b[6~");             // Page Down
await bot.send("\x1b[1~");             // Home
await bot.send("\x1b[4~");             // End

// 取得目前屏幕內容
// 返回 Promise<string[]>，陣列中每個元素是一行（含 ANSI 顏色碼）
const lines = await bot.getLines();    // 取得所有行
const line = bot.getLine?.(0);         // 同步取得第 n 行
console.log(line?.str);                // 輸出：某行內容（含 ANSI 碼）
```

### 導航操作

```typescript
// 進入特定看板
// 返回 Promise<boolean>
const success = await bot.enterBoardByName("Gossiping");

// 進入精華區
const success2 = await bot.enterIndex?.();

// 查詢目前位置
const currentBoard = bot._state?.position?.boardname;
```

### 內容取得

```typescript
// 取得看板文章列表
// 返回 Promise<PttClientArticleRow[]>
const articles = await bot.getArticles("Gossiping", 0);  // offset 預設為 0
// 每個 row:
// {
//   id: number,              // 文章編號
//   push?: string,           // 推文數（"1", "-5" 等）
//   date?: string,           // 發文日期
//   author?: string,         // 作者
//   status?: string,         // 標記（M/!/* 等）
//   title?: string,          // 標題
// }

// 取得單篇文章完整內容
// 返回 Promise<{ author?, title?, timestamp?, boardname?, lines? }>
const article = await bot.getArticle("Gossiping", 0);  // 取得第 0 篇
if (article?.lines) {
  const content = article.lines.join("\n");  // 完整文章內容（含推文）
}

// 取得最愛看板列表
// 返回 Promise<Board[]>
const favorites = await bot.getFavorite?.();
// 或指定位置
const favorites2 = await bot.getFavorite?.(0);        // 某個位置
const favorites3 = await bot.getFavorite?.([0, 1, 2]); // 多個位置
```

### 搜尋/過濾（可選）

```typescript
// 初始化搜尋條件
if (bot.searchCondition) {
  bot.searchCondition.init?.();
  
  // 新增搜尋條件
  bot.searchCondition.add?.("push", "10");      // 推文數 >= 10
  bot.searchCondition.add?.("author", "alice"); // 作者包含 alice
  bot.searchCondition.add?.("title", "PTT");    // 標題包含 PTT
}
```

---

## 狀態物件

```typescript
// 連接狀態
bot.state.connect    // boolean，是否已連接 WebSocket
bot.state.login      // boolean，是否已登入 PTT

// 內部狀態（不保證穩定）
bot._state?.connect
bot._state?.login
bot._state?.position?.boardname  // 目前看板名
```

---

## 常見終端操作序列

### 登入流程

```typescript
await bot.send("username\r");          // 輸入使用者名稱
// → 等待密碼提示，通過 "redraw" 事件監聽

await bot.send("password\r");          // 輸入密碼
// → 可能出現各種提示（中斷其他連線、錯誤提示等）
// → 需要根據屏幕內容判斷是否登入成功

// 檢查是否登入成功（屏幕出現 "主功能表" 或看板列表）
const screen = (await bot.getLines()).join("\n");
if (screen.includes("主功能表") || screen.includes("分類看板")) {
  // 登入成功
}
```

### 進入看板並取得文章

```typescript
const success = await bot.enterBoardByName("Gossiping");
if (success) {
  const articles = await bot.getArticles("Gossiping");
  // 處理文章列表
}
```

### 取得單篇文章

```typescript
const article = await bot.getArticle("Gossiping", 0);  // 第 0 篇
if (article?.lines) {
  console.log(article.title);
  console.log(article.author);
  console.log(article.lines.join("\n"));
}
```

---

## 關鍵限制

### 1. 沒有發文 API

```typescript
// ❌ ptt-client 不提供
bot.postArticle(...)     // 不存在
bot.compose(...)         // 不存在

// ✅ 必須手動發送終端命令
await bot.send("\x10");  // Ctrl+P，進入新文章
// 然後根據屏幕內容判斷後續步驟
```

### 2. 沒有推文/回覆 API

```typescript
// ❌ 不存在
bot.push(...)            // 不存在
bot.reply(...)           // 不存在

// ✅ 必須手動流程
await bot.send("X");     // 推文快捷鍵
// 等待推文類型菜單，發送類型，輸入內容，確認
```

### 3. 屏幕解析全靠你

```typescript
// ptt-client 返回原始終端資料（帶 ANSI 顏色碼）
const lines = await bot.getLines();

// ❌ 沒有結構化的 API
bot.getCurrentBoard()     // 不存在
bot.parsePushes()        // 不存在

// ✅ 必須自己解析
const screen = lines.join("\n");
const board = extractCurrentBoardName(screen);  // 自己實現正規表達式
const pushes = parsePushBuffer(lines);           // 自己實現解析
```

### 4. 錯誤處理依靠屏幕判斷

```typescript
// ptt-client 不區分各種錯誤
const success = await bot.enterBoardByName("NonExistent");
// 返回 false，但不告訴你原因

// ✅ 必須看屏幕
const screen = (await bot.getLines()).join("\n");
if (screen.includes("此看板不存在")) {
  // 看板不存在
} else if (screen.includes("您無權進入")) {
  // 權限不足
}
```

---

## 與 pttzzz adapter.ts 的關係

pttzzz 的 `adapter.ts` 在 ptt-client 之上，新增了：

- **序列化任務佇列**：避免並發命令衝突（ptt-client 底層有 WebSocket 競態條件）
- **屏幕解析工具**：
  - `stripAnsi()`：移除 ANSI 顏色碼
  - `extractCurrentBoardName()`：解析目前看板
  - `parsePostCategoryOptions()`：解析分類選單
  - `parsePushBuffer()`：解析推文
- **高級流程**：
  - `ensureNormalBoardView()`：確保進入看板
  - `submitPostFromBot()`：發文完整流程
  - `submitPushFromCurrentArticle()`：推文完整流程
- **連接管理**：
  - 自動重連
  - 登入狀態維護
  - 事件訂閱轉發

### 為什麼需要 adapter？

因為 ptt-client 的每個操作都需要：

```typescript
// 虛擬碼：ptt-client 的典型使用

// 1. 發送命令
const sent = await bot.send("some command");
if (!sent) throw new Error("Failed to send");

// 2. 等待回應（通過 redraw 事件或輪詢）
let screen = await bot.getLines();
let attempts = 0;
while (!isDesiredState(screen) && attempts++ < 10) {
  await sleep(100);
  screen = await bot.getLines();
}

// 3. 解析屏幕判斷是否成功
if (screen.includes("error pattern")) {
  throw new Error("Operation failed");
}

// 4. 提取需要的資料
const data = parseScreen(screen);
```

**adapter.ts 就是把這些重複的模式封裝成可靠的高級 API**。

---

## 除錯技巧

### 查看原始屏幕內容

```typescript
const lines = await bot.getLines();
console.log(lines.join("\n"));

// 或帶行號
lines.forEach((line, i) => console.log(`${i}: ${line}`));
```

### 查看 ANSI 原始資料

```typescript
// 不要 stripAnsi，保留顏色碼
const lines = await bot.getLines();
console.log(JSON.stringify(lines));  // 看到 \x1b[31m 等轉義序列
```

### 查看目前連接狀態

```typescript
console.log("Connected:", bot.state.connect);
console.log("Logged in:", bot.state.login);
console.log("Current board:", bot._state?.position?.boardname);
```

### 監聽屏幕更新

```typescript
bot.on("redraw", (screen) => {
  console.log("Screen updated, length:", screen.length);
  // screen 是完整終端內容（字符串，含 ANSI）
});
```

---

## 常見錯誤

| 錯誤 | 原因 | 解決方案 |
|------|------|--------|
| `bot.postArticle()` 找不到 | ptt-client 沒這個 API | 改用 `bot.send()` 手動流程 |
| 連續發送命令導致混亂 | WebSocket 競態條件 | 用 adapter 的 `runSerial` 或等待 redraw 事件 |
| 取得文章為空 | 沒進入看板或等待時間不夠 | 先 `enterBoardByName`，之後 `await sleep(200)` |
| 屏幕解析失敗 | ANSI 顏色碼干擾 | 用 `stripAnsi()` 移除顏色碼後再正規表達式匹配 |
| 登入失敗但返回 true | 沒檢查登入完成的屏幕標誌 | 檢查是否出現 "主功能表" 或其他預期屏幕 |

---

## 總結

**ptt-client 是一個最小化的工具**：

- ✅ **做得好**：WebSocket 連接、終端仿真、基礎資料提取
- ❌ **不做**：業務邏輯、流程控制、錯誤區分、屏幕解析

**上層應用（pttzzz）必須自己實現**：序列化、解析、流程控制、錯誤處理、使用者體驗。
