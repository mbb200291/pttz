# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (includes PTT WebSocket proxy at /ptt-ws)
npm run build      # TypeScript check + Vite build
npm run lint       # ESLint
npm run test       # Run all tests (vitest run)
npx vitest run src/lib/ptt/pushAggregator.test.ts  # Run a single test file
```

Dev server preview modes (bypass PTT login for UI development):
- `?preview=home` / `?preview=board` / `?preview=article` / `?preview=login`

## Architecture

pttzzz is a pure-frontend PTT reader. The client connects directly to PTT's WebSocket (`wss://ws.ptt.cc/bbs`). In dev mode, `vite.config.ts` proxies `/ptt-ws` to inject the required `Origin: https://term.ptt.cc` header (PTT rejects connections without it).

### Layer overview

```
ptt-client (npm)
    ↓
src/lib/ptt/adapter.ts       ← PTT access layer: login, listArticles, getArticle, disconnect
    ↓
src/hooks/usePttSocket.ts    ← Zustand store + bridge: wsStatus, pttState, credentials
    ↓
src/hooks/useBoard.ts        ← Board data: enter board, paginate article list, search/filter
src/hooks/useArticle.ts      ← Article data: body, aggregated pushes, edit records, debug dump
    ↓
src/components/              ← React UI
```

### Key design decisions

**adapter.ts** wraps `ptt-client` into a stable project interface. It serializes bot commands to avoid races, observes PTT terminal snapshot state, maps board/article data, and produces debug dumps in dev mode.

**usePttSocket.ts** uses Zustand with `subscribeWithSelector`. It bridges adapter state to the UI. Login safety default: do NOT disconnect other sessions unless the user explicitly opts in via the "中斷其他連線" checkbox.

**pushAggregator.ts** (`src/lib/ptt/pushAggregator.ts`) is the core of push/reply processing:
- Merges pushes by the same author within ≤5 minutes (unless terminated by `.。!?！？;；`)
- `||` at end of push forces merge with next push
- Full-width lines concatenate directly; non-full lines get a newline
- Detects nested replies via patterns like `回x樓`, `回xf`, `TO xf`, `reply to xf`, `>>xf`
- Assigns `replyTo`, `floorNumber`, `anchorOrder`, `score`, `isOP`, `sourceFloors`
- Article-level edits (`※ 編輯:`) become synthetic `edit` type pushes attached to the nearest reply

**parser.ts** (`src/lib/ptt/parser.ts`) provides low-level string utilities: `stripAnsi`, `parsePushLine`, `parsePushBuffer`, `splitArticleBody`, `extractArticleThreadEvents`.

**viewState.ts** (`src/lib/ptt/viewState.ts`) maps PTT connection states to safe UI views (e.g., redirects to home if connection drops while reading an article).

**App.tsx** manages top-level navigation with a simple `AppView` discriminated union (`home | board | article | article-by-aid`). No router library — state is in-memory only.

### Development workflow

Per `dev-notes/AGENTS.md`: when advancing a spec goal, create a new `goal-N-implementation-plan.md` and `goal-N-implementation-notes.md` in `dev-notes/`, then update `dev-notes/implement.md` with high-level architecture changes after completion. Do not modify `dev-notes/spec.md`.
