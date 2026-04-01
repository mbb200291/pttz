# PTT Article Processing – High-Level Architecture

## 🎯 目標

建立一條穩定且可擴充的資料處理流程，將 PTT terminal 畫面轉換為應用層可使用的結構化資訊。此架構強調分層與資料流轉換，而非特定實作細節。

---

## 一、整體架構概觀

整體系統可視為一條由「資料來源」到「應用消費端」的轉換管線：

```text
PTT Server (Telnet)
        ↓
Transport Layer
        ↓
Terminal Stream
        ↓
Text Layer
        ↓
Section Layer
        ↓
Semantic Layer
        ↓
Application Layer
```

每一層僅負責單一轉換任務，彼此透過資料傳遞串接。

---

## 二、分層說明

### 1. Transport Layer

負責與 PTT 建立連線並取得資料。

**職責**

- 建立 TCP / Telnet 連線
- 維持 session 狀態（登入、瀏覽位置）
- 接收連續的 terminal 輸出資料

**特性**

- 持續串流（streaming data）
- 與 UI / 資料解析邏輯完全解耦
- 不處理任何語意

---

### 2. Terminal Stream Layer

負責承接來自 Transport 的原始輸出。

**職責**

- 接收 terminal 畫面更新
- 維持畫面狀態（screen buffer 概念）
- 提供可讀取的畫面快照

**特性**

- 資料仍為「畫面導向」
- 尚未轉為可直接解析的文字內容
- 保留完整顯示順序

---

### 3. Text Layer

將畫面轉換為可處理的純文字。

**職責**

- 將畫面內容轉為 line-based text
- 消除與顯示相關的干擾（如控制碼）
- 保證輸出格式穩定

**輸出特性**

- 可逐行存取
- 順序穩定
- 可供後續切分

---

### 4. Section Layer

將整段文字切分為具語意邊界的區塊。

**職責**

- 根據畫面結構劃分區域
- 區分不同性質的內容（如標頭、正文、互動區）

**設計重點**

- 不解析內容意義
- 僅負責「區段邊界辨識」
- 輸出多個邏輯區塊

---

### 5. Semantic Layer

從各區塊中提取語意資訊。

**職責**

- 將文字內容轉換為具意義的資訊單位
- 區分不同類型資訊（例如文章資訊與互動資訊）

**特性**

- 開始具備「資料語意」
- 不再關心畫面排版
- 為後續組合做準備

---

### 6. Composition Layer

將不同來源的語意資訊整合。

**職責**

- 合併各區塊的資訊
- 建立完整的文章表示
- 保持欄位間的一致性

**設計重點**

- 不新增新資訊
- 僅負責整合與組裝

---

### 7. Application Layer

將最終結果提供給上層使用。

**職責**

- 提供資料給 UI（閱讀介面）
- 提供 API（對外服務）
- 或寫入儲存系統

**特性**

- 完全不依賴底層 terminal 細節
- 面向產品功能

---

## 三、資料流觀點

整個系統本質是一連串的資料轉換：

```text
Terminal Stream
  → Screen Representation
  → Plain Text
  → Logical Sections
  → Semantic Information
  → Unified Representation
```

每一步都降低資料的「不規則性」，提高可用性。

---

## 四、核心設計原則

### 1. 分層隔離

每一層只關心：

- 自己的輸入
- 自己的輸出

避免跨層耦合。

### 2. 單向資料流

資料應單向流動：

- 下游不回寫上游

確保系統易於理解與除錯。

### 3. 無狀態轉換（盡可能）

除了 Transport / Terminal 層外，其餘層應盡量：

- 不依賴外部狀態
- 可重複執行
- 易於測試

### 4. 可替換性

各層應可被替換，例如：

- 資料來源可由 Telnet 改為 Web
- Text Layer 可改用不同處理方式
- Section / Semantic 邏輯可演進

### 5. 與 UI 解耦

整個處理流程：

- 不應依賴前端呈現方式
- 不應包含互動邏輯
- 僅專注資料轉換

---

## 五、擴充方向

此架構不僅適用於文章，也可延伸至：

- 看板列表
- 使用者資訊頁
- 信件系統
- 搜尋結果頁

只需替換 Section 與 Semantic 階段的邏輯即可重用整體流程。

---

## 六、總結

此架構的核心在於：

> 將 PTT 的「畫面系統」轉換為「資料系統」

透過分層與資料流設計，把原本高度依賴 terminal 表現的內容，轉換為：

- 可分析
- 可重組
- 可擴展

的資訊形式，作為現代應用的基礎。

---

# PTT WebSocket API Spec (v1)

## 1. 目標

此 API 用於讓前端透過 WebSocket 與後端維持一個 PTT session，並以事件驅動方式：

- 建立 / 關閉 session
- 導覽看板與文章
- 取得結構化資料
- 發送互動操作
- 接收即時狀態更新

---

## 2. Connection

### Endpoint

```text
ws://<host>/ws/ptt

或

wss://<host>/ws/ptt
```

---

## 3. 訊息格式

所有訊息皆為 JSON。

基本格式：

```json
{
  "type": "event_type",
  "request_id": "optional-client-generated-id",
  "session_id": "optional-session-id",
  "payload": {}
}
```

**欄位說明：**

- `type`: 事件名稱
- `request_id`: 用於 request / response 對應
- `session_id`: 某個 PTT session 的識別值
- `payload`: 事件資料

---

## 4. Client → Server Events

### 4.1 session.create

建立一個新的 PTT session。

```json
{
  "type": "session.create",
  "request_id": "req-001",
  "payload": {
    "mode": "structured"
  }
}
```

### 4.2 session.close

關閉既有 session。

```json
{
  "type": "session.close",
  "request_id": "req-002",
  "session_id": "sess-123",
  "payload": {}
}
```

### 4.3 auth.login

使用帳號密碼登入 PTT。

```json
{
  "type": "auth.login",
  "request_id": "req-003",
  "session_id": "sess-123",
  "payload": {
    "username": "myuser",
    "password": "mypassword"
  }
}
```

### 4.4 board.enter

進入某個看板。

```json
{
  "type": "board.enter",
  "request_id": "req-004",
  "session_id": "sess-123",
  "payload": {
    "board": "Gossiping"
  }
}
```

### 4.5 board.fetch

取得當前看板文章列表。

```json
{
  "type": "board.fetch",
  "request_id": "req-005",
  "session_id": "sess-123",
  "payload": {
    "cursor": null
  }
}
```

`cursor` 可用於往上/下翻頁後的定位。

### 4.6 article.open

開啟某篇文章。

```json
{
  "type": "article.open",
  "request_id": "req-006",
  "session_id": "sess-123",
  "payload": {
    "article_ref": "AID_OR_INDEX"
  }
}
```

`article_ref` 可以是：

- 文章索引
- AID
- 其他由 server 定義的文章識別方式

### 4.7 article.fetch

取得目前文章的結構化內容。

```json
{
  "type": "article.fetch",
  "request_id": "req-007",
  "session_id": "sess-123",
  "payload": {}
}
```

### 4.8 article.next

開啟下一篇文章。

```json
{
  "type": "article.next",
  "request_id": "req-008",
  "session_id": "sess-123",
  "payload": {}
}
```

### 4.9 article.prev

開啟上一篇文章。

```json
{
  "type": "article.prev",
  "request_id": "req-009",
  "session_id": "sess-123",
  "payload": {}
}
```

### 4.10 push.create

對目前文章送出推文。

```json
{
  "type": "push.create",
  "request_id": "req-010",
  "session_id": "sess-123",
  "payload": {
    "push_type": "push",
    "content": "這篇不錯"
  }
}
```

`push_type` 可為：

- `push`
- `boo`
- `arrow`

### 4.11 navigation.back

返回上一層畫面。

```json
{
  "type": "navigation.back",
  "request_id": "req-011",
  "session_id": "sess-123",
  "payload": {}
}
```

### 4.12 screen.refresh

要求 server 重新同步目前狀態。

```json
{
  "type": "screen.refresh",
  "request_id": "req-012",
  "session_id": "sess-123",
  "payload": {}
}
```

---

## 5. Server → Client Events

### 5.1 session.created

```json
{
  "type": "session.created",
  "request_id": "req-001",
  "session_id": "sess-123",
  "payload": {
    "status": "ok"
  }
}
```

### 5.2 auth.result

```json
{
  "type": "auth.result",
  "request_id": "req-003",
  "session_id": "sess-123",
  "payload": {
    "success": true,
    "message": "login success"
  }
}
```

### 5.3 board.state

回傳看板狀態與文章列表。

```json
{
  "type": "board.state",
  "request_id": "req-005",
  "session_id": "sess-123",
  "payload": {
    "board": "Gossiping",
    "articles": [
      {
        "id": "article-1",
        "title": "title 1",
        "author": "user1",
        "date": "4/01",
        "popularity": 35
      },
      {
        "id": "article-2",
        "title": "title 2",
        "author": "user2",
        "date": "4/01",
        "popularity": 10
      }
    ],
    "cursor": "cursor-token"
  }
}
```

### 5.4 article.state

回傳文章狀態與內容。

```json
{
  "type": "article.state",
  "request_id": "req-007",
  "session_id": "sess-123",
  "payload": {
    "board": "Gossiping",
    "article": {
      "id": "article-1",
      "title": "title 1",
      "author": "user1",
      "time": "Wed Apr 1 12:00:00 2026",
      "content": "article content",
      "pushes": [
        {
          "type": "push",
          "user": "aaa",
          "content": "nice",
          "time": "04/01 12:30"
        }
      ]
    }
  }
}
```

### 5.5 push.result

```json
{
  "type": "push.result",
  "request_id": "req-010",
  "session_id": "sess-123",
  "payload": {
    "success": true,
    "message": "push sent"
  }
}
```

### 5.6 navigation.state

回傳目前所在位置。

```json
{
  "type": "navigation.state",
  "session_id": "sess-123",
  "payload": {
    "location": "article",
    "board": "Gossiping",
    "article_id": "article-1"
  }
}
```

`location` 可為：

- `home`
- `board`
- `article`
- `unknown`

### 5.7 screen.state

回傳目前畫面抽象結果。

```json
{
  "type": "screen.state",
  "request_id": "req-012",
  "session_id": "sess-123",
  "payload": {
    "location": "article",
    "structured": true,
    "updated_at": "2026-04-01T12:00:00Z"
  }
}
```

### 5.8 error

```json
{
  "type": "error",
  "request_id": "req-010",
  "session_id": "sess-123",
  "payload": {
    "code": "INVALID_STATE",
    "message": "cannot push when not in article view"
  }
}
```

---

## 6. 狀態模型

前端應假設一個 session 在任一時間點位於某個畫面狀態，例如：

- `home`
- `board`
- `article`

部分操作只可在特定狀態下執行，例如：

- `push.create` 只能用 `article`
- `board.fetch` 只能用 `board`
- `article.next` 只能用 `article`

若狀態不合法，server 應回傳 `error`。

---

## 7. 推薦互動流程

### 7.1 基本讀文流程

1. `session.create`
2. `auth.login`
3. `board.enter`
4. `board.fetch`
5. `article.open`
6. `article.fetch`

### 7.2 文章內操作流程

1. `article.fetch`
2. `article.next` / `article.prev`
3. `push.create`
4. `screen.refresh`

---

## 8. 設計建議

- 所有 client request 都帶 `request_id`
- server response 儘量回傳相同 `request_id`
- `session_id` 由 server 產生
- structured data 與 raw terminal 不要混在同一條主 API
- 若未來要支援 raw terminal mode，可額外定義：
  - `terminal.input`
  - `terminal.output`

---

## 9. 最小可用事件集（MVP）

若先做 MVP，建議只實作以下事件：

**Client → Server:**

- `session.create`
- `auth.login`
- `board.enter`
- `board.fetch`
- `article.open`
- `article.fetch`
- `article.next`
- `article.prev`

**Server → Client:**

- `session.created`
- `auth.result`
- `board.state`
- `article.state`
- `error`

---

## 10. 一句話總結

這個 WebSocket API 的核心是：

- 前端只送「操作意圖」
- 後端維持 PTT session
- 後端回傳「結構化狀態 JSON」

---

# PTT Telnet + pyte 實作計劃

## 目標

以 Python 為主，先做出一個可用的最小系統，完成以下流程：

1. 連線至 PTT
2. 接收 terminal 輸出
3. 用 `pyte` 維護 screen 狀態
4. 從目前畫面擷取文字
5. 將文章畫面轉成結構化資料
6. 透過 WebSocket 提供前端取用

---

## 技術選型

- Language: Python
- Terminal emulator: `pyte`
- Telnet connection: Python socket / telnet client
- Web framework: FastAPI
- Realtime channel: WebSocket
- Data format: JSON

---

## 階段一：建立最小 Telnet 接收流程

### 目標

先確認可以穩定接收 PTT 畫面資料。

### 工作項目

- 建立與 PTT 的連線
- 能送出基本按鍵或指令
- 能持續接收 server 回傳內容
- 將原始輸出導入 `pyte`

### 產出

- 一個可連線並更新 terminal 畫面的 Python 程式

---

## 階段二：接入 pyte 維護畫面

### 目標

將 raw terminal stream 轉成可讀的 screen text。

### 工作項目

- 建立 `pyte.Screen`
- 建立 `pyte.Stream`
- 將收到的資料餵給 `pyte`
- 實作取得目前畫面文字的方法

### 產出

- 可從 `pyte` 取得目前完整畫面文字

---

## 階段三：文章畫面資料抽取

### 目標

將文章頁內容整理成前端可用資料。

### 工作項目

- 定義文章頁處理流程
- 切出文章主要區塊
- 抽出文章基本資訊、正文、推文
- 輸出統一 JSON 結果

### 產出

- 一個可將文章畫面轉為結構化資料的模組

---

## 階段四：WebSocket API

### 目標

讓前端可以透過 WebSocket 操作 session 並取得資料。

### 工作項目

- 建立 WebSocket endpoint
- 定義基本事件
- 支援建立 session
- 支援進入看板、開啟文章、取得文章資料
- 回傳 JSON 格式結果

### 產出

- 一個可供前端連線的 WebSocket API

---

## 階段五：前後端串接驗證

### 目標

確認前端可正常取得文章資料並顯示。

### 工作項目

- 前端發送基本事件
- 後端回傳文章資料
- 驗證導覽流程是否可用
- 檢查 session 與狀態同步

### 產出

- 一條可實際操作的最小讀文流程

---

## 建議 MVP 範圍

第一版先只做：

- 登入
- 進入單一看板
- 取得文章列表
- 開啟單篇文章
- 取得文章內容
- 回傳 JSON 給前端

先不要做：

- 推文送出
- 發文
- 複雜錯誤恢復
- 多使用者併發優化

---

## 建議資料夾結構

```text
project/
  backend/
    connection/
    terminal/
    extract/
    api/
    main.py
```

---

# 一、系統定位

此 parser 系統的職責是將：

```
PTT article screen
```

轉換為：

```
Structured article data
```

整體流程可抽象為：

```
Raw terminal data
  → Screen text
  → Article regions
  → Structured fields
  → Normalized article object
```

# 二、整體組件架構

```
[Telnet Source / Terminal Source]
↓
[Screen Extractor]
↓
[Article Region Splitter]
↓
[Header Parser] --------┐
[Content Parser] -------├──> [Article Assembler]
[Push Parser] ----------┘
↓
[Normalizer / Validator]
↓
[Article Output]

```
