# Goal 11 Verified Article Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow push-like article commands to reuse a demonstrably active PTT article, while falling back to the existing identity-checked reopen path whenever terminal position is uncertain.

**Architecture:** Add a private session tracker to `@pttzzz/browser` which stores article identity plus the exact verified terminal snapshot. Article reads leave the verified article open and register it. Push-like writes acquire that context by comparing the requested key, parsed current header and snapshot; a mismatch invalidates it and invokes the existing locate/reopen flow. Push entry remains a condition-driven state machine and records semantic outbound actions for diagnosis.

**Tech Stack:** TypeScript, `ptt-client`, Vitest, existing `PttGateway` contracts.

---

### Task 1: Isolated article-session model

**Files:**
- Create: `packages/browser/src/internal/articleSession.ts`
- Create: `packages/browser/src/internal/articleSession.test.ts`

- [x] Write tests for recording, matching and invalidating an article session. Matching must require a compatible `ArticleKey`, normalized board/author/title, and an unchanged verified terminal snapshot.
- [x] Run `npx vitest run --config vitest.config.ts src/internal/articleSession.test.ts` from `packages/browser` and confirm RED because the module does not exist.
- [x] Implement `ArticleSessionTracker` as a private browser utility without importing UI or gateway code. It must expose `record`, `match`, `invalidate`, and read-only diagnostic state.
- [x] Rerun the focused test and confirm GREEN.

### Task 2: Keep a verified read session available

**Files:**
- Modify: `packages/browser/src/internal/terminalDriver.ts`
- Modify: `packages/browser/src/internal/terminalDriver.test.ts`

- [x] Add tests showing `readArticleSource` leaves the article reader open after a successful final read and records its key, parsed author/title, board and final visible screen. Add failure/abort coverage showing it exits and invalidates instead.
- [x] Run the focused terminal-driver tests and confirm the successful-read expectation fails because the current `finally` always calls `leaveArticleReaderIfNeeded`.
- [x] Add one `ArticleSessionTracker` to `PttClientTerminalDriver`. On successful read, verify the final visible screen is an article screen matching the returned article before recording it. On failure, disconnect, login, raw `send`, and unrelated navigation, invalidate it. Preserve the existing public interfaces.
- [x] Rerun the focused tests and confirm GREEN.

### Task 3: Acquire current article or use compatibility fallback

**Files:**
- Modify: `packages/browser/src/internal/terminalDriver.ts`
- Modify: `packages/browser/src/internal/terminalDriver.test.ts`

- [x] Add tests for two paths: a matching active article sends no board/article navigation before `X`; a stale/mismatched session executes the existing board lookup, article reopen and identity/AID checks.
- [x] Run the focused tests and confirm RED because every command currently relocates the article.
- [x] Extract `acquireArticleContext`. First parse and match current terminal evidence against the tracker. If it matches, return the stored verified identity. Otherwise invalidate and execute the current `locateArticleIdentity` plus `fetchArticleFromBotManuallyWithOpen` checks unchanged.
- [x] Stop unconditionally returning to the board after push-like commands. After a confirmed send, record the updated article screen when verifiable; after an error or uncertain outcome, invalidate and retain existing cleanup behavior.
- [x] Rerun the focused tests and confirm GREEN, including repeated multi-range withdrawal reusing the same article only after each confirmed state.

### Task 4: Replay real push-entry transitions and trace outbound actions

**Files:**
- Modify: `packages/browser/src/internal/pushEntry.test.ts`
- Modify: `packages/browser/src/internal/terminalDriver.ts`

- [x] Replace the instant screen-switch helper with a transcript helper that can expose partial screens over successive reads. Cover non-author `X → menu → 3 → neutral input`, author `X → neutral input`, and the supplied unexpected `X → native push input` trace.
- [x] Add assertions for the exact semantic action order. The diagnostic must record action names only (`open-push-menu`, `select-neutral`, `submit-content`, `confirm`, `cancel`) and never the draft body.
- [x] Run the focused push-entry test and confirm RED for missing semantic action data and delayed transitions.
- [x] Route all sends inside `submitPushFromCurrentArticle` through a local traced action helper. Preserve strict prompt checks: neutral commands only accept a neutral empty input; unexpected native push/boo cancels without content or automatic retry.
- [x] Rerun the focused tests and confirm GREEN.

### Task 5: Compatibility and documentation

**Files:**
- Inspect: `packages/browser/src/gatewayContract.test.ts`
- Modify: `dev-notes/goal-11-implementation-plan.md`
- Modify: `dev-notes/goal-11-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [x] Review gateway contract coverage to confirm existing commands and `ActionReceipt` semantics remain unchanged; browser-private session state is absent from `@pttzzz/core` public return types.
- [x] Document the session reuse/fallback behavior, diagnostic action trace, safety cancellation and the fact that no real PTT write is part of automated verification.
- [x] Mark every completed checklist item in both Goal 11 plans.
- [x] Run `npm run verify` from the worktree root. Result: core 374, browser 278 and Web 302 tests passed; 11 helper tests, builds and package smoke passed; lint reported no errors and the three existing Fast Refresh warnings.
- [x] Review `git diff --check`, the final diff and branch name. Commit design, plan, tests, implementation and notes together on `feature/goal-11-ui-polish`; do not merge or push.
