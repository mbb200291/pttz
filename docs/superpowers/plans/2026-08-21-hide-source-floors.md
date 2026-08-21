# Hide Source Floors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove visible PTT source-floor chips while retaining the original floors as non-visible DOM metadata and application state.

**Architecture:** Keep `AggregatedPush.sourceFloors` unchanged. `PushItem` will serialize non-empty source floors into `data-source-floors` on the card container, while deleting the display-only formatter and `FloorChip` component.

**Tech Stack:** TypeScript, React, Vitest, React DOM server rendering.

---

### Task 1: Hide floor chips and retain DOM metadata

**Files:**
- Modify: `src/components/PushThread.tsx:154-183,450-545`
- Test: `src/components/__tests__/PushThread.test.tsx:245-259`

- [x] **Step 1: Replace the visible-floor test with a metadata contract**

```tsx
it("hides source floors while retaining DOM metadata", () => {
  const html = renderToStaticMarkup(
    <PushThread
      score={0}
      pushes={[
        push({ id: "range", sourceFloors: [1, 2], floorNumber: 1 }),
        push({ id: "interleaved", sourceFloors: [4, 7], floorNumber: 4 }),
      ]}
    />,
  );

  expect(html).toContain('data-source-floors="1,2"');
  expect(html).toContain('data-source-floors="4,7"');
  expect(html).not.toContain("1–2F");
  expect(html).not.toContain("4、7F");
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/components/__tests__/PushThread.test.tsx`

Expected: FAIL because the markup still renders `1–2F` and `4、7F`, and has no `data-source-floors` attribute.

- [x] **Step 3: Make the minimal component change**

Delete `formatSourceFloors` and `FloorChip`. Add the metadata to the visible card container:

```tsx
<div
  data-source-floors={
    push.sourceFloors.length > 0 ? push.sourceFloors.join(",") : undefined
  }
  style={{
    border: cardBorder,
    // existing styles remain unchanged
  }}
>
```

Delete the header block that renders `<FloorChip>`.

- [x] **Step 4: Verify GREEN and regression safety**

Run: `npx vitest run src/components/__tests__/PushThread.test.tsx`

Expected: all PushThread tests pass.

Run: `npm test && npm run build`

Expected: all repository tests and the production build pass.

- [x] **Step 5: Commit**

```bash
git add src/components/PushThread.tsx src/components/__tests__/PushThread.test.tsx docs/superpowers/plans/2026-08-21-hide-source-floors.md
git commit -m "fix: hide PTT source floor labels"
```
