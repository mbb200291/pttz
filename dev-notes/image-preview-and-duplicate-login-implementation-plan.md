# Image Preview Retry and Duplicate Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓暫時載入失敗的圖片自動重試一次，並只在 PTT 實際偵測到重複登入後詢問是否中斷其他連線。

**Architecture:** 圖片重試狀態留在 `ImagePreview` 元件內，不改變內容 parser 或核心資料模型。登入表單只送一般登入；既有 `duplicate_login` 狀態與第二階段決策函式繼續負責 PTT 的 `Y/n` 提示。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Zustand

---

### Task 1: 圖片預覽暫時失敗重試

**Files:**
- Modify: `apps/web/src/components/MediaPreview.tsx`
- Create: `apps/web/src/components/__tests__/MediaPreview.test.tsx`

- [x] **Step 1: 寫入失敗測試**

建立使用 fake timers 的元件測試，驗證：第一次 `error` 不顯示 fallback；延遲兩秒後 `src` 加入 `pttzzz_retry=1`；第二次 `error` 才顯示原始網址連結；rerender 新 URL 後恢復初始圖片。

- [x] **Step 2: 驗證測試因缺少重試行為而失敗**

Run:

```bash
npm test -w @pttzzz/web-example -- --run src/components/__tests__/MediaPreview.test.tsx
```

Expected: FAIL，第一次 `error` 後目前實作立即顯示 fallback link。

- [x] **Step 3: 實作一次性延遲重試**

在 `ImagePreview` 中以 `attempt` 表示初始、重試與最終失敗狀態。第一次錯誤排程兩秒後把圖片 `src` 改成保留原網址並附加 `pttzzz_retry=1` 的網址；第二次錯誤才顯示 fallback。使用 effect cleanup 清除 timer，並在 `url` 改變時重設狀態。

- [x] **Step 4: 驗證圖片測試通過**

Run:

```bash
npm test -w @pttzzz/web-example -- --run src/components/__tests__/MediaPreview.test.tsx
```

Expected: PASS。

### Task 2: 移除登入前的中斷連線選項

**Files:**
- Modify: `apps/web/src/components/LoginModal.tsx`
- Modify: `apps/web/src/components/__tests__/LoginModal.test.tsx`
- Modify: `apps/web/src/hooks/usePttSocket.ts`
- Modify: `apps/web/src/hooks/__tests__/usePttSocket.test.ts`

- [x] **Step 1: 修改測試表達新流程**

登入表單靜態渲染測試應確認不含「中斷其他連線」與 checkbox；socket bridge 測試應確認 `submitLogin(username, password)` 固定傳送 `disconnectExistingSession: false`，但 `submitDuplicateLoginDecision(true/false)` 仍能傳送使用者的第二階段決策。

- [x] **Step 2: 驗證登入測試失敗**

Run:

```bash
npm test -w @pttzzz/web-example -- --run src/components/__tests__/LoginModal.test.tsx src/hooks/__tests__/usePttSocket.test.ts
```

Expected: FAIL，現有登入表單仍包含 checkbox，且 `submitLogin` 仍接受第三個參數。

- [x] **Step 3: 簡化登入表單與 submitLogin**

移除 `LoginModal` 的 `kickOthers` state、checkbox 與說明，登入時只呼叫 `submitLogin(username, password)`。將 `submitLogin` 移除第三個參數並固定設定 `disconnectExistingSession: false`；保留重複登入選擇畫面與 `submitDuplicateLoginDecision`。

- [x] **Step 4: 驗證登入測試通過**

Run:

```bash
npm test -w @pttzzz/web-example -- --run src/components/__tests__/LoginModal.test.tsx src/hooks/__tests__/usePttSocket.test.ts
```

Expected: PASS。

### Task 3: 完整驗證並整合提交

**Files:**
- Modify: `dev-notes/image-preview-and-duplicate-login-design.md`
- Modify: `dev-notes/image-preview-and-duplicate-login-implementation-plan.md`

- [x] **Step 1: 更新 checklist 並檢查工作區**

只納入本計畫相關檔案；不得納入既有的 `README.md` 或 `docs/whitepaper/pttzzz-core.md` 變更。

- [x] **Step 2: 執行完整驗證**

Run:

```bash
npm run verify
```

Expected: 所有測試、建置、lint 與 package smoke test 通過；既有 lint warnings 可保留，但不得新增 error。

- [x] **Step 3: 合併設計與實作為單一 commit**

將相關檔案加入 stage，然後 amend `6bb59d6`：

```bash
git add dev-notes/image-preview-and-duplicate-login-design.md \
  dev-notes/image-preview-and-duplicate-login-implementation-plan.md \
  apps/web/src/components/MediaPreview.tsx \
  apps/web/src/components/LoginModal.tsx \
  apps/web/src/components/__tests__/MediaPreview.test.tsx \
  apps/web/src/components/__tests__/LoginModal.test.tsx \
  apps/web/src/hooks/usePttSocket.ts \
  apps/web/src/hooks/__tests__/usePttSocket.test.ts
git commit --amend -m "fix: retry media previews and defer login decision"
```

Expected: HEAD 為單一包含設計、計畫、測試與實作的 commit，且工作區只剩使用者原有變更。
