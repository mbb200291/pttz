# 文件分層配置

## 目標

讓文件與它描述的層級放在一起：規則留在根 `docs/`，核心 API 跟著 `packages/core`，介面範例跟著 `apps/web`。

## 配置

```text
docs/
  whitepaper/                 規則層白皮書與案例
  fixtures/                   規則層可執行案例
packages/core/docs/
  contracts.md                核心公開契約
  AI-INTERFACE.md             核心的 AI 整合指南
apps/web/docs/examples/
  ...                         UI 層範例與最小替代 UI
dev-notes/code-architecture-guide.md
  ...                         跨層 repository 實作與讀碼指南
```

`@pttzzz/browser` 是核心實作的瀏覽器 transport，沒有獨立 reader-facing 文件需要新增。根 `docs/` 的白皮書仍是三層皆可依循的規則提案。

## 公開架構與內部實作指南

`packages/core/docs/architecture.md` 是公開且穩定的架構概覽，只描述三層責任、套件邊界與依賴方向。`dev-notes/code-architecture-guide.md` 是 repository 內部指南，保留讀寫資料流、連線生命週期、回文 identity、測試位置、host 限制、常見陷阱與目前技術 stack。公開文件不依賴 `dev-notes`；內部指南可引用公開架構與契約。

## 邊界

- 只做檔案移動與連結、測試、smoke script 的路徑更新。
- 不修改 API、規則、案例或範例內容。
- `dev-notes` 保留歷史與工作紀錄，更新其中會因實際路徑移動而失效的現況連結。
- 不把 repository-specific hooks、driver workflow 或工具版本寫成公開 API 保證。
