# 文件分層配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將規則、核心與 UI 文件移到所屬層級，並維持所有引用與驗證。

**Architecture:** 根 `docs/` 保留規則白皮書與 fixtures；核心 API 文件移至 `packages/core/docs/`；UI 範例移至 `apps/web/docs/examples/`。以 `git mv` 保留歷史，再更新所有 runtime、test、smoke 與 reader-facing 相對連結。

**Tech Stack:** Markdown、static HTML、TypeScript path imports、Node smoke script、npm verification。

---

### Task 1: 移動核心與 UI 文件

**Files:**

- Move: `docs/api/*` → `packages/core/docs/`
- Move: `docs/examples/*` → `apps/web/docs/examples/`

- [x] **Step 1: Move files with history**

Run `git mv docs/api/AI-INTERFACE.md packages/core/docs/AI-INTERFACE.md`, `git mv docs/api/contracts.md packages/core/docs/contracts.md`, and `git mv docs/examples apps/web/docs/examples`.

- [x] **Step 2: Update relative reader links**

Update moved Markdown files so contracts, whitepaper, and sibling example links resolve from their new directories. Keep prose unchanged.

- [x] **Step 3: Commit the moves**

Commit with `docs: colocate core and UI documentation`.

### Task 2: Update executable references and verify

**Files:**

- Modify: `scripts/smoke-packages.mjs`
- Modify: current reader-facing references under `dev-notes/`, `packages/`, and `apps/`

- [x] **Step 1: Update moved-path references**

Replace references to `docs/api` with `packages/core/docs`, and `docs/examples` with `apps/web/docs/examples`, except historical plans that describe the old migration steps.

- [x] **Step 2: Verify paths and behavior**

Run `rg -n "docs/api|docs/examples" scripts packages apps dev-notes --glob '!goal-9-implementation-plan.md'`, `npm run verify`, and `git diff --check`.

- [x] **Step 3: Record completion**

Mark this plan complete and commit with `docs: complete layered documentation move`.

### Task 3: 分開公開架構與 repository 實作指南

**Files:**

- Modify: `packages/core/docs/architecture.md`
- Modify: `dev-notes/code-architecture-guide.md`
- Modify: `dev-notes/docs-layer-layout-design.md`
- Modify: `dev-notes/docs-layer-layout-implementation-plan.md`

- [x] **Step 1: 核對目前技術 stack**

以 root、core、browser 與 web 的 `package.json`、TypeScript 設定及 Vite 設定為準，辨識 runtime dependency、開發工具與 host 要求；不沿用舊計畫中的版本描述。

- [x] **Step 2: 標示公開架構文件的範圍**

在 `packages/core/docs/architecture.md` 說明其內容只承諾三層責任、套件邊界與依賴方向，不納入 repository-specific 實作細節，也不連向 `dev-notes`。

- [x] **Step 3: 補全內部程式架構指南**

完整保留既有 read/write path、reply identity、connection、測試、host 與常見陷阱，加入依 manifest 重建的技術 stack、workspace 角色及主要選型說明，並連向公開架構與契約。

- [x] **Step 4: 驗證文件**

檢查所有新增相對連結均存在，執行 `git diff --check`，並確認 `code-architecture-guide.md` 中列出的 package、工具與版本和目前 manifest 一致。

- [x] **Step 5: 提交文件更新**

Commit with `docs: preserve detailed architecture guide`.
