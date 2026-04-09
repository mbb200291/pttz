# PTT Client Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current terminal-buffer-driven PTT access layer with `ptt-client` while preserving the existing React UI data shape during the migration.

**Architecture:** Introduce a dedicated adapter layer that wraps `ptt-client` and exposes board/article/login operations in shapes compatible with current hooks. Migrate hook consumers from raw terminal parsing to adapter-backed queries in small slices, starting with dependency integration and a compile-safe adapter import path.

**Tech Stack:** React 18, Vite 6, TypeScript 5, Vitest, `ptt-client`

---

### Task 1: Add a compile-safe adapter seam

**Files:**
- Create: `src/lib/ptt/adapter.ts`
- Test: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("ptt adapter module", () => {
  it("exports a factory for the ptt-client-backed adapter", async () => {
    const mod = await import("../adapter");
    expect(typeof mod.createPttAdapter).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts`
Expected: FAIL because `../adapter` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface PttAdapter {}

export function createPttAdapter(): PttAdapter {
  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts`
Expected: PASS

### Task 2: Install and validate `ptt-client` import compatibility

**Files:**
- Modify: `package.json`
- Modify: `src/lib/ptt/adapter.ts`
- Test: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] **Step 1: Extend the failing test to assert the adapter can resolve the external client**

```ts
it("exposes the underlying client constructor when integration is available", async () => {
  const mod = await import("../adapter");
  expect(mod.pttClientModuleLoaded).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts`
Expected: FAIL because the adapter does not load `ptt-client` yet.

- [ ] **Step 3: Add the dependency and wire the import**

```ts
import Ptt from "ptt-client";

export const pttClientModuleLoaded = typeof Ptt === "function";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts`
Expected: PASS, or a concrete compile/runtime integration failure to report.

### Task 3: Map current UI data needs onto adapter operations

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Test: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] **Step 1: Write a failing mapping test for board rows**

```ts
it("maps library article rows into the current ArticleSummary shape", async () => {
  const { mapArticleRow } = await import("../adapter");
  const row = {
    id: 12345,
    push: "爆",
    date: "04/09",
    author: "tester",
    status: "M",
    title: "[公告] hello",
  };

  expect(mapArticleRow(row)).toEqual({
    index: 12345,
    mark: "M",
    pushCount: "爆",
    date: "04/09",
    author: "tester",
    title: "[公告] hello",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts`
Expected: FAIL because `mapArticleRow` is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function mapArticleRow(row: {
  id: number;
  push?: string;
  date?: string;
  author?: string;
  status?: string;
  title?: string;
}) {
  return {
    index: row.id,
    mark: row.status?.trim() || " ",
    pushCount: row.push?.trim() || "",
    date: row.date?.trim() || "",
    author: row.author?.trim() || "",
    title: row.title?.trim() || "",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts`
Expected: PASS

### Task 4: Replace one live read path and verify

**Files:**
- Modify: `src/hooks/useBoard.ts`
- Test: `src/hooks/__tests__/useBoard.test.ts` or create a new focused adapter-backed hook test

- [ ] **Step 1: Write a failing hook test that consumes adapter-backed board data**

```ts
it("loads board articles through the adapter", async () => {
  expect("replace with existing hook harness").toBe("adapter-backed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/hooks/__tests__/useBoard.test.ts`
Expected: FAIL with the old buffer-driven behavior.

- [ ] **Step 3: Implement the minimal hook migration**

```ts
// Replace buffer parsing with adapter.listArticles(boardName)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/hooks/__tests__/useBoard.test.ts`
Expected: PASS

