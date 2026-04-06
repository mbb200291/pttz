# PTTzzz — Agent 實作指引

## 專案概覽

打造一個純前端的現代 PTT 閱讀器：

- 伺服器僅靜態 serving（無後端邏輯）
- Client 直接連 PTT WebSocket（`wss://ws.ptt.cc/bbs`）
- 對推文做聚合與嵌套處理

---

## 技術棧

- **框架**：React + TypeScript（Vite）
- **樣式**：Tailwind CSS
- **狀態管理**：Zustand 或 React Context
- **WebSocket**：原生 WebSocket API，包成自訂 hook

---

## 架構

```
src/
├── lib/
│   ├── ptt/
│   │   ├── client.ts          # WebSocket 連線管理
│   │   ├── parser.ts          # PTT ANSI/文章解析
│   │   └── pushAggregator.ts  # 推文聚合邏輯（核心）
│   └── utils.ts
├── hooks/
│   ├── usePttSocket.ts        # WS 連線 hook
│   ├── useBoard.ts            # 看板文章列表
│   └── useArticle.ts          # 單篇文章（含聚合推文）
├── components/
│   ├── BoardList.tsx
│   ├── ArticleList.tsx
│   ├── Article.tsx
│   └── PushThread.tsx         # 推文討論串（支援嵌套）
└── pages/
    ├── Home.tsx
    ├── Board.tsx
    └── Article.tsx
```

---

## 實作順序

### Phase 1：PTT WebSocket 連線

**目標**：能成功登入並取得看板文章列表。

1. 實作 `src/lib/ptt/client.ts`
   - 連接 `wss://ws.ptt.cc/bbs`
   - 處理登入流程（訪客登入：送 `guest` → Enter → Enter）
   - ANSI escape code 解析（顯示中文）
   - 實作命令佇列避免競態

2. 實作 `src/hooks/usePttSocket.ts`
   - 封裝連線狀態（connecting / connected / error）
   - 暴露 `sendCommand(cmd: string)` 方法

3. 實作 `src/hooks/useBoard.ts`
   - 進入看板：`s [看板名稱]`
   - 解析文章列表（編號、標題、作者、日期、推文數）

4. 實作 `src/hooks/useArticle.ts`
   - 抓取單篇文章原始內容
   - 呼叫 `pushAggregator` 處理推文

### Phase 2：推文聚合處理（核心邏輯）

**目標**：實作 `src/lib/ptt/pushAggregator.ts`

#### 資料結構

```typescript
interface RawPush {
  type: "push" | "boo" | "neutral"; // 推/噓/→
  author: string;
  content: string;
  time: string; // "MM/DD HH:mm"
}

interface AggregatedPush {
  id: string; // 流水號，用於嵌套引用
  type: "push" | "boo" | "neutral";
  author: string;
  content: string; // 聚合後完整內容
  time: string;
  isOP: boolean; // 是否為原 po
  replyTo: string | null; // 回覆對象的 id（嵌套用）
  score: number; // 此推文的淨推數
}
```

#### 聚合規則（依 idea.md）

**規則一：同作者連續推文合併**

```
條件：
  1. 連續回文（中間無他人），直接合併
  2. 不連續但：
     a. 時間間隔 ≤ k 分鐘（建議 k=5）
     b. 前幾則推文內容都塞滿了（PTT 推文上限 ~45 bytes）
     c. 最後一則結尾不是句號「。」或「.」

處理：移除每則推文開頭的「回x樓」前綴後再拼接
```

**規則二：識別嵌套回覆**

```
若推文內容開頭符合：/^回(\d+)樓[：:]/
  → 解析樓層號碼 n
  → 將此推文標記為 replyTo = floor[n].id
  → 移除「回n樓：」前綴後作為顯示內容
```

**規則三：推文評分**

```
文章層級分數 = 第一層聚合推文中，type='push' 的總數 - type='boo' 的總數
推文層級分數 = 針對同一 AggregatedPush，其所有嵌套回覆的 push - boo
```

**規則四：原 po 回覆標示**

情境1

```
若推文 author === 文章 author
  → isOP = true
  → 在 UI 顯示 [OP] 標示
```

情境2
後續文章編輯，有新的文字出現在回文之間，需視為原作者回文

#### 實作步驟

```typescript
// src/lib/ptt/pushAggregator.ts

const MAX_PUSH_BYTES = 45;
const TIME_GAP_MINUTES = 5;

export function aggregatePushes(
  rawPushes: RawPush[],
  articleAuthor: string,
): AggregatedPush[] {
  // 1. 先將連續同作者推文合併成候選群組
  // 2. 對不連續但符合條件的也合併
  // 3. 對每個聚合推文，偵測 replyTo
  // 4. 計算 isOP
  // 5. 指派 id（用索引即可，如 "push-0", "push-1"...）
  // 6. 計算 score（在所有聚合完成後，統計回覆中的 push/boo）
}

function isFull(content: string): boolean {
  return Buffer.byteLength(content, "utf8") >= MAX_PUSH_BYTES - 2;
}

function timeDiffMinutes(t1: string, t2: string): number {
  // 解析 "MM/DD HH:mm" 格式計算差距
}
```

### Phase 3：UI 元件

**目標**：現代化呈現，取代 BBS 風格。

1. **BoardList**：看板列表，支援搜尋
2. **ArticleList**：文章列表，支援無限捲動
3. **Article**：
   - 文章標頭（標題、作者、時間、看板）
   - 文章正文（保留 ANSI 顏色，轉成 CSS）
   - 推文討論串
4. **PushThread**：
   - 第一層：所有非嵌套的聚合推文
   - 嵌套層：`replyTo` 指向的推文下方，縮排顯示
   - 每則推文顯示：作者、[OP] 標示、內容、時間、推/噓數

---

## 關鍵技術細節

### PTT WebSocket 協議

```
連線：wss://ws.ptt.cc/bbs
登入流程：
  收到登入提示 → 送 "guest\r\n"
  收到密碼提示 → 送 "\r\n"（訪客無需密碼）
  收到同意條款 → 送 "y\r\n"
  收到主選單   → 登入完成

讀取文章：
  進看板：送 "s [board]\r\n"
  翻頁：  送 " "（空白）
  進文章：送 目標行號
  離開：  送 "q"
```

### ANSI 解析

PTT 使用 Big5 編碼與 ANSI 顏色碼，需要：

- `iconv` 或 `big5` npm 套件解碼 Big5
- 解析 `\x1b[Nm` 顏色碼，轉為 `<span style="color:...">` 或 Tailwind class

### CORS 注意事項

PTT WebSocket 允許跨域連線，不需要 proxy。
但靜態 serving 建議使用 Nginx 或 GitHub Pages。

---

## 開發啟動

```bash
npm create vite@latest pttzzz -- --template react-ts
cd pttzzz
npm install tailwindcss zustand iconv-lite
npm run dev
```

---

## 測試建議

針對 `pushAggregator.ts` 撰寫 unit tests：

```typescript
// 測試情境：
// 1. 單則推文不聚合
// 2. 連續同作者推文合併
// 3. 塞滿但結尾是句號 → 不合併
// 4. 塞滿且無句號，時間間隔小 → 合併
// 5. 「回3樓：...」識別為嵌套
// 6. OP 標示正確
// 7. 推/噓計分正確
```

---

## 實作優先序

1. WS 連線 + 登入（驗證可行性）
2. 推文聚合邏輯（最核心，先有 unit test）
3. 看板文章列表 UI
4. 文章閱讀 + 推文顯示 UI
5. 嵌套推文互動（展開/收合）
6. ANSI 顏色支援
7. 無限捲動 / 效能優化
