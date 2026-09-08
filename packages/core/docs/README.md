# @pttzzz/core

目前套件版本為 `0.1.0`，宣告支援規則 `0.1.x`。版本資訊以 [package.json](../package.json) 為準；這些資訊不代表套件已發布至 npm。使用本核心建立其他介面，請參閱英文 [UI 開發指南](./DEVELOPMENT_GUIDE.md)；替本核心實作 gateway，請參閱 [gateway 契約](./contracts.md#gateway-author-contract)。

pttzzz 將規則、實作與呈現分成三層，使同一套 PTT 討論語意可以由不同連線方式與使用者介面重複使用。

## 版本與相容性

規則層、核心實作層與介面層各自採語意化版本。白皮書與 fixture manifest 宣告規則版本；`@pttzzz/core` 與 `@pttzzz/browser` 以 npm package version 宣告公開 API 版本；每個實作在 package metadata 的 `pttzzz` 欄位宣告可支援的規則與相依套件範圍。規則 `0.x` 階段的次版可以包含不相容調整，介面不得只憑版本相同就假定可相容，必須同時檢查宣告的支援範圍。

本文件記錄本版核心的責任、套件邊界與驗證方式。公開 API 以 [contracts.md](./contracts.md) 與套件匯出的型別為準。

## 三層責任

1. **設計層**：白皮書定義分散推文聚合、嵌套回文、文章與回文推噓、編輯及撤回等語意。Fixture 將規則轉成可跨實作驗證的案例。
2. **核心實作層**：`@pttzzz/core` 提供領域模型、高階 client、規則解析與 gateway 契約；`@pttzzz/browser` 實作瀏覽器環境的 PTT gateway。
3. **介面層**：網頁、行動裝置或其他 UI 只使用核心公開 API，不自行解析終端文字，也不直接操作 PTT terminal。

## 套件分工

### `@pttzzz/core`

- 定義文章、回文、投票、編輯、事件、錯誤與操作結果等公開資料契約。
- 將原始文章事件依白皮書規則轉換成結構化討論。
- 透過 `PttzzzClient` 提供讀取與寫入操作。
- 透過 `PttGateway` 定義連線實作必須提供的能力。
- 不依賴 React、Zustand、DOM、WebSocket 或特定 terminal client。

### `@pttzzz/browser`

- 實作 `PttGateway`，負責瀏覽器 WebSocket 與 PTT terminal workflow。
- 將 ANSI 畫面、按鍵、提示與原始樓號限制在套件內部。
- 提供 `createBrowserClient()`，組合 browser gateway 與核心 client。
- 透過 `@pttzzz/browser/testing` 提供測試用 gateway；一般正式 UI 不應依賴此入口。

### 介面實作

- 從 `@pttzzz/core` 使用公開資料型別與 `PttzzzClient`。
- 在瀏覽器中從 `@pttzzz/browser` 建立 client。
- 以穩定的文章識別與 `replyId` 操作內容，不使用原始樓號作為 UI identity。
- 根據公開事件與 `Result` 更新狀態，不讀取 gateway 或 terminal driver 的內部狀態。

## 依賴方向

```text
白皮書與 fixture
        ↓
@pttzzz/core
        ↑
@pttzzz/browser → ptt-client → PTT WebSocket
        ↑
介面實作
```

`@pttzzz/core` 不依賴 browser package；browser package 依賴並實作 core 的 gateway 契約。介面可以替換成其他 UI，gateway 也可以替換成其他環境的實作，兩者不應互相依賴。

## 公開與內部邊界

- 一般 UI 只使用 `@pttzzz/core` 與 `@pttzzz/browser` 的 package root exports。
- 完整公開型別以[公開契約](./contracts.md)為準。
- `@pttzzz/core/internal` 只保留給官方 browser adapter 整合，不是 UI API，也不提供相容性保證。
- Terminal driver、畫面判讀、raw `send()`、ANSI parser 與原始樓號定位屬於 browser 內部實作，不得成為介面層契約。
- 白皮書定義行為語意；公開契約定義程式介面。兩者衝突時應先釐清並修正實作，不由 UI 建立另一套規則。

## Fixture 符合性驗證

本核心使用[白皮書規則案例](../../../docs/fixtures/thread-events/README.md)驗證解析與操作語意。以下命令從 repository 根目錄執行。

只驗證 JSON 契約、Rule ID 與雙向覆蓋：

```bash
npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts --testNamePattern "fixture contract"
```

比較案例與目前核心實作：

```bash
npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts
```

Fixture 契約通過只表示資料與規則索引完整；行為測試通過才表示目前實作符合已驗證案例，並不證明所有可能輸入都正確。出現差異時，先檢查白皮書、案例、測試轉接與實作，不能為迎合程式輸出而改寫規範期望。其他核心實作應自行建立測試轉接器，沿用相同案例集。
