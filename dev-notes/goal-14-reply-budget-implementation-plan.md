# 長回文傳送預算實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 網頁版最多發出 30 則實體推文，輸入時依實測容量顯示剩餘則數，取代既有字數上限。

**Architecture:** browser 提供限定當次連線與文章的同步規劃器，core 轉換回覆身分並公開契約，UI 僅呈現計數及提供 30 則政策。送出前重新測量、規劃與檢查，預覽不作為送達或容量仍有效的證據。

**Tech Stack:** TypeScript、React、Vitest、現有 UAO 編碼器及終端 driver。

**Spec:** [已確認設計](goal-14-reply-budget-design.md)

## 執行結果（2026-09-21）

- Task 0 完成，提交 `64f44ee`；Task 1–4 已完成實作與離線驗證，作為第二個功能提交。
- 下方保留原始步驟清單作為設計依據；實際測試與審查結果記於 [實作筆記](goal-14-implementation-notes.md#長回文傳送預算2026-09-21)。
- 準備與送出共用文章定位 resolver 及既有容量測量方法，未另複製終端流程。跨層 UI／分段／讀回測試置於 browser 套件，維持 UI 公開 API 邊界。
- 完整 verify 通過：core 448、browser 467、web 382、代理 21、smoke helpers 11；建置與 package smoke 通過，lint 0 errors／9 既有 warnings。未 PTT 實測或推送 remote。

## 全域限制

- 30 是網頁版政策；core／browser 不硬編碼此上限，不限制歷史回文的讀取與聚合。
- 前綴、尾標、內部空白行與橋接片段全部計入實際片段數；整份草稿末端連續空白與換行先移除，不計入。
- 草稿不得靜默截斷；未知送達結果不得重送。
- UI 不直接操作終端、不複製分段演算法；所有新契約為可選能力，既有第三方 gateway 仍可編譯。
- 本輪只做離線測試，不連線發表 PTT 測試內容，不推送或合併分支。
- 使用者指定按功能分成兩個提交：第一個是中斷符號改為反斜線的程式、測試、fixture 與規則文件；第二個是 30 則上限、即時計數、末端空白處理及其測試與文件。不是將程式和白皮書分開提交。
- 最新白皮書已將終止符號改為反斜線；此次一併對齊 sender／receiver，不擅自保留底線的舊控制語意。

## Review Focus

1. 輸入框切換文章後，前一個容量探測才返回：不得覆蓋新文章狀態（Task 3）。
2. 草稿剛好填滿最後一行，尾標多占一欄：須以真正分段數判斷，不只除以容量（Task 1）。
3. 預覽後看板容量變小：送出前若超過 30 則，必須零片段送出（Task 2）。
4. 已送出部分片段後重開輸入框：沿用原計畫與剩餘進度，不重新當作新草稿（Task 2、3）。
5. 取消探測未成功返回、重新登入、回覆目標失效：不得提供看似有效的數字或發表探測字元（Task 2）。

## Task 0：中斷符號獨立提交

**Files:** `packages/core/src/pushAggregator.ts`、`packages/browser/src/internal/multipartReply.ts` 及各自測試、`docs/fixtures/thread-events/`、`docs/whitepaper/core-rules-examples.html`、對應規則文件。

- [ ] 先補反斜線中斷聚合、底線不再是控制符號的 RED。sender 與 receiver 須同時切換，否則新 sender 的完整還原檢查會失敗。

```ts
expect(planReplyDraft("短句", 55)).toEqual(["短句\\"]);
expect(aggregatePushes([
  { type: "neutral", author: "alice", content: "第一則\\", time: "01/01 12:00" },
  { type: "neutral", author: "alice", content: "第二則。", time: "01/01 12:00" },
], "op").pushes.map(reply => reply.content)).toEqual(["第一則", "第二則。"]);
```

- [ ] 依最新白皮書調整 marker 辨識與發送，補字面反斜線的內容保留或送出前拒絕、滿行邊界及全形縮排回歸。底線保留為普通正文，不相容舊中斷語意。
- [ ] 同步相關 fixture、HTML 與規則索引，不調整產品上限或草稿正規化；先跑受影響測試及建置。
- [ ] 差異確認不含 30 則功能後提交 `fix: align reply stop marker with whitepaper`。

## Task 1：共用規劃器與片段上限

**Files:**
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/browser/src/internal/multipartReply.ts`
- Modify: `packages/core/src/pushAggregator.ts`
- Test: `packages/browser/src/internal/multipartReply.test.ts`
- Test: `packages/core/src/pushAggregator.test.ts`

**Interfaces:**

```ts
export interface ReplyDraftEstimate { total: number; capacity: number }
export interface ReplyDraftPlanner {
  plan(content: string): Result<ReplyDraftEstimate>;
}
export interface PrepareReplyDraftInput { article: ArticleKey; replyId?: ReplyId }
export interface GatewayPrepareReplyDraftInput { article: ArticleKey; floor?: number }
// Add maxFragments?: number to both ReplyDraftInput and GatewayReplyDraftInput.
// Add { kind: "too-many-fragments"; total: number; maxFragments: number }
// to ReplyDraftIssue; retain old error types for source compatibility.
```

- [ ] 補 RED：30 行 `短句。` 可發送；31 行在任何 send callback 前拒絕；1100 個 ASCII 字元於 55 欄仍可發送。測試使用真實 queue 與 planner，不用假計數。

```ts
const send = vi.fn(async () => ({ ok: true as const, outcome: "sent" as const }));
await expect(new ReplyDraftQueue().run({ ...input,
  content: Array(31).fill("短句。").join("\n"), maxFragments: 30,
}, async () => ({ author: "alice", capacity: 55 }), send))
  .rejects.toMatchObject({ replyIssue: { kind: "too-many-fragments", total: 31, maxFragments: 30 } });
expect(send).not.toHaveBeenCalled();
```

- [ ] 執行 `npx vitest run src/internal/multipartReply.test.ts --config vitest.config.ts`（cwd `packages/browser`），確認因缺少片段限制及既有 1000 限制失敗。
- [ ] 移除 `validateDraft` 的 1000 上限，保留字元／可還原性驗證。queue 的操作身分包含 maxFragments；若設定，必須為正整數。首次規劃完成後、建立可送出狀態前拒絕超限；續送不得修改政策。

```ts
if (input.maxFragments !== undefined &&
    (!Number.isSafeInteger(input.maxFragments) || input.maxFragments < 1)) {
  throw new GatewayError("REPLY_DRAFT_NOT_SENT", "Invalid fragment limit", false);
}
const pieces = planReplyDraft(input.content, layout.capacity, input.floor, layout.author, separator);
if (input.maxFragments !== undefined && pieces.length > input.maxFragments) {
  throw replyPreparationError({ kind: "too-many-fragments", total: pieces.length,
    maxFragments: input.maxFragments }, "Reply fragment limit exceeded");
}
```

- [ ] 抽出 `createReplyDraftPlanner(layout, floor, separator, valid): ReplyDraftPlanner`，plan 為同步純分段計算；空草稿回傳 total=0。每次計算先檢查 valid，失效傳回結構化錯誤；捕捉分段錯誤為 Result，不把例外拋至 React render。
- [ ] 抽出共用 `normalizeReplyDraft(content: string): string`，CRLF 轉 LF、末端 `trimEnd()`；保留既有開頭正規化，不擴大更動。planner 與 queue 使用同一結果，片段預算在正規化後計算，不能在送出途中才清理。
- [ ] 補末端空白測試：半形／全形空白、Tab、LF、CRLF 的混合尾端，不影響分段結果；純空白為 0 則且不能送出；內部空白行不被清除。保留輸入框原字串，讀回結果與正規化正文比對。

```ts
const base = "第一段。\n\n　　第二段。";
expect(planReplyDraft(base + " \u3000\t\r\n\n  ", 55))
  .toEqual(planReplyDraft(base, 55));
// Also assert the receiver reconstructs base, including its internal blank line.
```

- [ ] 使用 Task 0 的新尾標，以原文及 33／34／53／54 欄經 parsePushBuffer → aggregatePushes 驗證，不改 expected 迎合實作。
- [ ] 更新原本只驗證 500／1000 政策的測試為片段政策，保留編碼與逐字還原案例。跑 core、browser 測試；已知白皮書索引差異留待 Task 4 修正，不忽略其失敗。
- [ ] 檢查本階段的程式及回歸，保留至整體驗證後提交，不包含無關修改。

## Task 2：實測容量與公開準備 API

**Files:**
- Modify: `packages/core/src/contracts.ts`, `packages/core/src/client.ts`
- Modify: `packages/browser/src/gateway.ts`
- Modify: `packages/browser/src/internal/terminalDriver.ts`
- Modify: `packages/browser/src/internal/fakeTerminalDriver.ts`
- Test: `packages/browser/src/internal/multipartTerminal.test.ts`
- Test: `packages/browser/src/gateway.test.ts`, `packages/browser/src/internal/fakeTerminalDriver.test.ts`

**Interfaces:**

```ts
// Optional gateway/driver method:
prepareReplyDraft?(input: GatewayPrepareReplyDraftInput): Promise<ReplyDraftPlanner>;
// Public client method:
prepareReplyDraft(input: PrepareReplyDraftInput): Promise<Result<ReplyDraftPlanner>>;
```

- [ ] 補 RED：使用既有模擬終端畫面，prepare 只探測並取消、不發出確認 y；取消未返回文章即失敗。client 將 replyId 解析成原始樓號，無目標不觸發探測；不支援方法的 gateway 回傳 UNSUPPORTED。
- [ ] 執行 browser 的 gateway、multipartTerminal 測試，确认新增準備能力不存在時失敗。
- [ ] 抽出 prepare／send 共用的文章定位與容量取得流程，保留 AID、索引失效、文章身分與 epoch 驗證。所有探測經 `runSerial`，禁止以固定延遲推定取消成功。
- [ ] 探測取消並確認返回後才建立 planner，valid 使用連線及文章準備世代；不得使用探測前已失效的 epoch。重新登入／斷線／切換目標均失效。fake driver 使用自身帳號容量，呼叫同一 planner factory。
- [ ] core 沿用 replyTarget 解析與 Result 錯誤傳遞；sendReplyDraft 必須轉送 maxFragments。browser gateway 與 terminal wrapper 都串接新方法。
- [ ] 補「預覽 55 欄→送出 33 欄、草稿因此超限且零寫入」「第二個看板重新測量」「準備後斷線」「同 operationId 變更上限拒絕」「部分續送不改原計畫」回歸。這些測試觀察實際送出 callback 或終端按鍵，而不是只驗證 mock 被呼叫。
- [ ] 跑 browser 全套及 build:packages，通過後保留至最終分開提交。

## Task 3：輸入時計數與過期結果防護

**Files:**
- Create: `apps/web/src/hooks/useReplyDraftPlanner.ts`
- Create: `apps/web/src/lib/replyBudget.ts`
- Modify: `apps/web/src/hooks/usePttActions.ts`
- Modify: `apps/web/src/components/Article.tsx`, `apps/web/src/components/Composer.tsx`
- Modify: `apps/web/src/lib/replyFailureGuidance.ts`
- Test: `apps/web/src/components/__tests__/Composer.test.tsx`
- Test: `apps/web/src/components/__tests__/ArticleMultipartReply.test.tsx`
- Create: `apps/web/src/hooks/__tests__/useReplyDraftPlanner.test.tsx`

**Interfaces:**

```ts
// apps/web/src/lib/replyBudget.ts
export const MAX_REPLY_FRAGMENTS = 30;
// Add optional prepareReplyDraft to PttActionsResult using Task 2 client signature.
// Hook result, bound to client + article + replyId + composer generation:
type DraftPlannerState =
  | { status: "loading" }
  | { status: "error"; error: CoreError }
  | { status: "ready"; planner: ReplyDraftPlanner };
// Composer receives plannerState and onRetryPlan; synchronous plan(body)
// derives total, never starts terminal work during input or render.
```

- [ ] 補 RED：準備中允許輸入但送出停用；取得 planner 後以真實計數顯示剩餘；30 可送、31 不可送；改回短文立即恢復。編輯舊推文與部分續送維持原本語意。
- [ ] 補連續輸入尾端空白／Enter 的 UI 測試：輸入值仍包含尾端字元，但剩餘則數不變；再次輸入正文後，原本尾端換行變為內部換行，按實際片段數重新計算。剛好 30 則後追加尾端換行仍可送；新增有內容的第 31 則則不可送。
- [ ] 用 deferred promises 測試 A 文章 prepare 尚未完成就切到 B，B 先返回、A 後返回時不得覆寫 B；關閉輸入框後不得更新；prepare reject 保留草稿且可重試。
- [ ] 執行 web 指定測試，確認缺少計數／停用／過期防護而失敗。
- [ ] Hook 的 effect 以稳定文章 key、replyId、client 與重試序號驅動。cleanup 標記舊請求無效；不要把每 render 新建的 actions 函數列為造成無限探測的依賴。重新連線／target 改變時清除舊 planner。
- [ ] Composer 每次 body 變化同步呼叫 planner.plan，顯示下列衍生結果，保留固定高度避免位移。

```ts
const remaining = MAX_REPLY_FRAGMENTS - estimate.total;
const label = remaining < 0
  ? `超出 ${-remaining} 則`
  : `剩餘 ${remaining} / ${MAX_REPLY_FRAGMENTS} 則`;
// loading: 計算中…; preparation failure: 未能計算 + 重試 action.
// Invalid content uses existing actionable guidance; never shows raw errors.
```

- [ ] Article 新草稿送出必帶 maxFragments=MAX_REPLY_FRAGMENTS；舊部分送出紀錄沿用原 input。送出前容量變化的 too-many-fragments 顯示超出數量，保留草稿並重新準備計數，不自动重送。
- [ ] 未提供 prepare 能力的 multipart 路徑不可假設容量；顯示可理解的不可用狀態。更新 mock 使測試包含真實功能所需契約，不為通過舊測試放寬此保護。
- [ ] 跑 web 全套、跨 gateway/core/Article 測試及 build，通過後保留至最終分開提交。

## Task 4：文件、規則案例與整體驗證

**Files:**
- Modify: `docs/whitepaper/pttzzz-core.md`
- Modify: `docs/fixtures/thread-events/thread.json` 及其引用同一規則的 fixture
- Modify: `docs/whitepaper/core-rules-examples.html`
- Modify: `apps/web/docs/README.md`
- Modify: `packages/core/docs/contracts.md`, `packages/browser/README.md`
- Modify: `dev-notes/goal-14-implementation-notes.md`, `dev-notes/implement.md`

- [ ] 白皮書只保留編碼容量、分段與可還原語意；移除已無定義的草稿上限敘述，不新增 30。用「客戶端可自訂發送限制，不影響讀取聚合」表達實作邊界。
- [ ] 同步 THREAD-006 的規則索引及反斜線案例。移除舊產品限制的規範引用，保留有價值的長文原始資料；不得為覆蓋數字而把案例掛到不相關規則。
- [ ] README 面向使用者簡述「每次最多 30 則，依看板與內容計算，輸入時顯示剩餘則數」，不加入驗收指示或內部技術說明。
- [ ] contracts 文件說明可選準備能力、有效期、錯誤結果及 maxFragments 的送出前防護；其他客戶端不必採用 30。
- [ ] 執行 `npm run verify` 及 `git diff --check`。需要 loopback 權限時依環境申請；不以跳過測試宣稱完整通過。
- [ ] 確認規則版本政策：若反斜線變更涉及已公開契約，依專案現有版本慣例更新，不自行改 unrelated package 版本。
- [ ] 記錄各層測試數、建置及 lint 結果，明確標示離線測試、未 PTT 實測。Task 0 已獨立提交；其餘 30 則預算、尾端清理與對應文件在驗證後形成第二個 commit，不推送 remote。

## 執行方式

建議由目前 agent 依序實作：先完成 Task 0 的規則符號提交，再執行 Task 1–4 的預算功能。每階段先確認 RED，再做最小實作與 GREEN；整體審查後完成第二個提交。
