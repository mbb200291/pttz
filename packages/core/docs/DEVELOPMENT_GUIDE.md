# Building a UI with @pttzzz/core

This guide is for developers and AI assistants building a user interface on top of the existing `@pttzzz/core` implementation. It explains how to consume the public client, render its data, and handle user actions safely. It does not teach how to implement another core or redefine the rules.

For an independent rules implementation, start with the [whitepaper](../../../docs/whitepaper/pttzzz-core.md) and its implementation-neutral [fixture guide](../../../docs/fixtures/thread-events/README.md). For this package's architecture and tests, see the [core README](./README.md).

## Article text formatting (core/browser 0.3+)

`createArticle`, `editArticle`, and `replyArticleToBoard` accept optional `formatting: readonly ArticleTextStyle[]`. Keep `content` as plain text, not Markdown, HTML, ANSI, or editor keystrokes. This is a presentation contract, separate from the reply-edit rule syntax.

```ts
import { articleTextRuns, type CreateArticleInput } from "@pttzzz/core";
const draft: CreateArticleInput = {
  board: "Test", title: "Example", content: "Normal red text",
  formatting: [{ start: 7, end: 10, bold: true, color: 31 }],
};
const previewRuns = articleTextRuns(draft.content, draft.formatting);
// Render each run as escaped text; map bold/color to your own CSS.
// Only on explicit user submission: await client.createArticle(draft).
```

- Offsets are JavaScript UTF-16 positions: start inclusive, end exclusive. Do not split a surrogate pair. Unlike reply section-edit indices, these offsets follow textarea selection APIs.
- Ranges must be ordered, nonoverlapping, nonempty, and within content. `bold` is optional boolean (PTT high intensity, not a guaranteed font weight); `color` is one of 30–37 (black, red, green, yellow, blue, magenta, cyan, white).
- Nonempty formatting requires nonblank content, at most 50,000 UTF-16 units, and no C0/C1 controls except tab and LF. Normalize CRLF before recording offsets. Invalid formatting is rejected before gateway writes with `INVALID_INPUT`/`not-sent`.
- The helper may throw on an invalid draft: catch it in preview, show a validation error and disable submission. Never let preview errors unmount the editor.
- Do not silently reuse offsets after editing. The reference UI removes intersected styles and shifts later ranges using a minimal text diff; repeated identical characters can make the inferred edit boundary ambiguous.
- Include formatting in uncertain-write fingerprints. A failed or uncertain write must not automatically retry.
- Use matching 0.3+ core and gateway implementations; older gateways may ignore unknown fields. No formatting is supported for one-line pushes, reply votes, or reply edits.
- `Article.body` can contain source ANSI. The Web reader safely projects allowlisted SGR colors and intensity into styled text and adapts wrapping to its container. The reference editor still strips existing ANSI and warns that old colors are not retained. This release is not a full ANSI round-trip editor.

## Layer model

- **Rules layer** — the whitepaper defines the meaning of aggregation, nested replies, article/reply votes, edits, and withdrawals.
- **Core implementation layer** — `@pttzzz/core` defines public contracts and applies the rules. `@pttzzz/browser` is the current browser gateway that connects those contracts to PTT.
- **UI layer** — a web, mobile, or desktop application renders core DTOs and sends semantic commands. A UI must not parse terminal text itself.

Package versions are declared in `package.json.version`; supported rules and dependency ranges are declared in `package.json.pttzzz`. See the [core implementation README](./README.md), [browser README](../../browser/README.md), and [Web README](../../../apps/web/docs/README.md) for version-specific choices. Check publication availability before using registry installation commands; repository package metadata alone does not prove a release exists.

## Getting started

Install the public packages and consume `PttzzzClient`:

```bash
npm install @pttzzz/core @pttzzz/browser
```

Use `createBrowserClient()` in a browser application:

```ts
import { createBrowserClient } from "@pttzzz/browser";

const client = createBrowserClient();
```

Use only package-root exports. Do not import `@pttzzz/core/internal`, a terminal driver, or a browser adapter's private helper. The public contracts are documented in [contracts.md](./contracts.md).

## Browser gateway requirements

`@pttzzz/core` is platform-neutral and does not depend on a browser, React, WebSocket, or `ptt-client`. `@pttzzz/browser` currently provides the real PTT connection and therefore requires a browser-compatible bundler and `Buffer`.

The host application must provide a same-origin `/ptt-ws` WebSocket proxy that forwards to `wss://ws.ptt.cc/bbs` and adds the Origin expected by PTT. This is a host/server responsibility; UI code must not call terminal APIs to work around it.

## Connection and login lifecycle

Connect before login. Most asynchronous client operations return `Result<T>`; `disconnect()` returns `Promise<void>` and `subscribe()` returns an unsubscribe function. Expected operational failures are represented by `Result`; unexpected programming errors may still throw. Credentials come from the user and should not be logged or persisted by the UI. Preserve other sessions by default, and ask for an explicit decision when handling a duplicate-session prompt.

Code snippets use application-owned placeholders such as `showError` and `renderArticle`. They illustrate integration boundaries rather than a complete application.

```ts
const connected = await client.connect();
if (!connected.ok) {
  showError(connected.error);
  return;
}

const session = await client.login({
  username,
  password,
  disconnectExistingSession: false,
});
if (!session.ok) showError(session.error);
```

On logout or application shutdown, call `disconnect()`. It clears local client state even when the gateway reports an expected cleanup failure.

## Reading boards and articles

`listBoards()` without a source returns the hot-board view. Favorite and category sources are distinct; `filterBoards()` may combine them as an intersection. `searchBoards()` searches board-name prefixes only.

Article search and filtering require a non-empty query or filter. Do not turn a failed search into an unfiltered article list. Cursors and category cursors are opaque, session-scoped tokens: return them unchanged to the same client, never parse them as terminal offsets, and never persist them across sessions.

Article identity is represented by an `ArticleKey` (`index` or canonical `aid`). Keep the key returned by the API with the article; do not replace it with a UI array position. Reply identity is always `replyId`, never a display floor or card index.

Treat `ArticleSummary.publishedAt` as source-provided display text, not necessarily a complete timestamp. PTT board lists normally expose only month/day. Do not infer missing years or reorder paginated results by that field; preserve the gateway order and use numeric article indexes as the stable order cue for index-based PTT boards.

`articleKeyId()` produces an opaque in-memory comparison key. Do not decode its string representation or treat it as a persistence format. Index and AID keys remain distinct representations; the UI must not assume that it can convert between them.

Check `BoardListPage.kind` before rendering: `boards` contains boards, while `directory` may contain both boards and category entries. `searchBoards()` and `filterBoards()` return board pages only. Prefer `onlineUsers` when present; otherwise display `popularityLabel` without inventing a numeric value for `HOT` or `爆!`. Keep pagination cursors paired with the same source and filters. A successful login or disconnect invalidates previous session cursors.

## Progressive article loading

`getArticle()` resolves to a final article. While the source is being read, the subscription may receive partial or updated articles:

```ts
import { articleKeyId, type CoreEvent } from "@pttzzz/core";

const revisions = new Map<string, number>();
let activeKey: string | null = null;

const unsubscribe = client.subscribe((event: CoreEvent) => {
  if (event.type !== "article.partial" && event.type !== "article.updated") return;
  const key = articleKeyId(event.articleKey);
  if (key !== activeKey) return;
  if (event.revision <= (revisions.get(key) ?? -1)) return;
  revisions.set(key, event.revision);
  renderArticle(event.article);
});
```

Track revisions per article and ignore stale events. When switching articles, increment a request generation and check both the generation and key when the request settles; otherwise a slower previous request can overwrite the active view. A partial article may still change its grouping, tree, scores, edits, or visibility. Show an incomplete state until `completeness === "final"`.

## Rendering choices belong to the UI

The core owns reply targets, identity, source metadata, and semantic state. A UI may choose its own layout, sorting controls, and depth presentation while retaining core identifiers for actions. Version-specific presentation decisions belong in [the Web implementation README](../../../apps/web/docs/README.md).

Render `article.articleVotes` for proposal article votes, `article.nativeVotes` for raw PTT totals, and `reply.votes` for reply ratings. These are distinct domains. Prefer `reply.votes.score` and `reply.votes.viewerVote` over deprecated fields. Respect `reply.visible`, preserve content line breaks, and render article edit records separately from the body. Treat article text and links as untrusted content; do not inject them as executable HTML.

Do not expose raw source floors in ordinary UI unless the product explicitly chooses a debug view. Debug metadata must be opt-in.

## Semantic writes

### Automatic reply drafts

Use `client.sendReplyDraft({ operationId, article, content, pushType, replyId?, resume? }, onProgress?)`
for a whole reply draft. The browser gateway measures capacity, encodes and splits
it; do not split by UI character count or add protocol markers yourself. Omit
`replyId` for an article comment; target a loaded reply by its stable `replyId`
for a nested reply. Nested drafts always use native neutral comments.

This optional gateway capability returns `Result<ReplyDelivery>`. Check `status`
as well as `ok`: `complete` means all `total` pieces were confirmed; `paused`
retains `confirmed` and can be explicitly resumed with the same immutable ID and
payload; `uncertain` is not safe to resend. Progress observers are informational.
Do not interpret a read refresh as evidence that a write was absent. Old gateways
without this capability return an unsupported result without falling back to an
unsafe one-shot write. Existing single-write methods retain their contracts.

For a confirmed `not-sent` result, optional `error.replyIssue` provides actionable
preparation details: `too-long` includes `excessColumns` (two half-width columns
equal one full-width character), `unsupported-characters` lists characters to
replace, and `connection`, `article-unavailable`, `capacity`, or `content-layout`
identify the relevant recovery step. Preserve the draft and render UI-owned copy;
do not display raw transport messages or infer a category by matching their text.
An absent issue means unknown, not invalid content. This additive field does not
change delivery outcomes or authorize resending uncertain/partially sent drafts.

The reference composer retains drafts while its Article component remains mounted,
including closing/reopening the modal. Navigation or reload does not provide
durable recovery. Browser receipts also live in memory and become unusable across
authentication changes. Never invent a fresh ID to retry a partially sent draft.

Default aggregation follows rules 0.3: two minutes for nonconsecutive fragments,
no time cap for consecutive fragments, with author/target/control/terminator
boundaries still enforced. A custom `aggregation.nonconsecutiveGapMinutes` is an
explicit nonstandard profile and must be applied to both partial and final reads.

Send semantic DTOs and let core/browser format PTT control text. Reply and vote operations target `replyId`; they do not target a card position or a guessed floor:

```ts
await client.replyToReply({
  article: articleKey,
  replyId: selectedReply.replyId,
  content: text,
  pushType: "neutral",
});

await client.voteReply({
  article: articleKey,
  replyId: selectedReply.replyId,
  direction: "push",
});
```

`replyArticleToBoard()` creates a PTT article and is not a push reply. `editArticle()` edits the article body; `editReply()` edits a reply through the whitepaper's control semantics. Never concatenate control prefixes in UI code.

Load the article before acting on a reply so the client can resolve its `replyId` to source events. Check the `Result` of every write and reload when needed to reconcile displayed state. Legacy single-write methods return `void` on success, not a new article identity; draft delivery methods return the delivery state described above. `editArticle({ article, content })` does not require an edit summary. Section edits use `mode: "section"` with `changes`, rather than a `content` field; consult the contract and fixtures for range semantics. Do not infer write permission from a successful local preview.

## Errors and uncertain writes

Handle the structured `Result` outcome explicitly:

- `not-sent`: the operation was not sent; retry only when `retryable` is true.
- `sent` on an error: sending has occurred, but the overall operation failed; it is not safe to resend automatically. Reload to reconcile the result.
- `uncertain`: delivery cannot be determined; do not automatically retry, or a duplicate vote/edit may be created.

Expected gateway failures should be rendered as user-facing errors. Do not use a broad `catch` as a substitute for checking `Result`; unexpected programming errors should remain visible during development.

## Cleanup and event safety

Keep the unsubscribe function returned by `subscribe()` and call it when the component or store scope ends. Cancel stale article requests where possible. Never allow an event for a background article to update the active article. Always release the client connection on explicit logout.

The current `GetArticleInput` does not expose an abort signal. Use request generations to ignore obsolete results rather than inventing a cancellation argument. Keep one client per intended connection lifetime, not one per render. On session replacement, clear session-scoped cursors and UI caches. Component cleanup should unsubscribe; only the owner of the shared client should disconnect it.

## Other runtime environments

Use the existing browser gateway for browser UIs. A different runtime may need a compatible gateway, but implementing that transport is separate from building the UI. Its author-facing contract is documented in [contracts.md](./contracts.md#gateway-author-contract); UI code should continue to use the public client rather than transport commands.

## AI implementation checklist

When asking an AI to create another UI, provide it with this guide, [contracts.md](./contracts.md), the whitepaper, and the Web example notes. Ask it to:

1. use package-root exports only;
2. preserve `ArticleKey`, `replyId`, cursor, and revision semantics;
3. render partial and final states separately;
4. handle all structured write outcomes without automatic uncertain retries;
5. leave rule parsing and wire formatting to core/browser, outside UI code;
6. declare the core/browser and rules versions it supports; and
7. add UI tests for stale requests, event ordering, loading states, and write error outcomes.

## Common mistakes

- Treating a search result's relative number as a canonical article index.
- Using display order, depth, or source floor as `replyId`.
- Recomputing scores or reply trees in the UI.
- Persisting opaque cursors across login sessions.
- Treating partial data as immutable final data.
- Automatically retrying an uncertain write.
- Importing internal parser or terminal modules from a UI.
