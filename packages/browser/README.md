# @pttzzz/browser

Official browser gateway and client factory for `@pttzzz/core`.

The current package version is `0.3.0`, targeting rules `0.3.x`. See
[package.json](./package.json) for dependencies and compatibility declarations.
These declarations do not establish npm publication status.

## Automatic reply drafts

Drafts are limited to 1,000 half-width units (500 full-width characters), measured with the PTT UAO codec after outer-whitespace and CRLF normalization. Internal newlines count as one unit. Generated target prefixes and markers do not count toward this limit, but do count toward each packet's capacity. Oversized drafts are rejected without publishing any packet or truncating the draft.

`PttzzzClient.sendReplyDraft` accepts an immutable `operationId`, full text,
article and optional target reply. The browser measures capacity from a cancelled
confirmation, plans UAO-safe pieces, validates their aggregate result, and sends
them serially. Each confirmation must match the exact sender, text and capacity.
New drafts use `|` only when continuation needs it; their final piece ends in
natural punctuation or `_`. Old `||` / `|!` remain readable. The default
nonconsecutive merge window is two minutes, including in the web client.

Check `ReplyDelivery.status`, not only `Result.ok`: only `complete` means all pieces
were confirmed. `paused` may resume with the same ID and immutable payload;
`uncertain` must not retry blindly. Receipts are in-memory and invalidated across
authentication changes. The fake gateway uses the same planner and receipt queue.
No live PTT posting is part of the automated validation.

## Article formatting

Version 0.3 accepts the core's optional ordered UTF-16 `formatting` ranges for
article create/edit/board-reply commands. Only high intensity and foreground
colors 30–37 are encoded. The driver inserts controlled SGR using PTT editor
Ctrl+U (literal ESC insertion), never caller-provided terminal keystrokes.
Formatted create requires a confirmed editor; blank formatted content is rejected
before sending. Ordinary unformatted writes retain their previous behavior.

The fake gateway persists the equivalent ANSI source, not Ctrl+U commands.
Readback still exposes source body text and does not promise rich-text round-trip.
No real PTT posting was used to verify this release: tests cover the gateway and
scripted terminal sends. See the [UI formatting contract](../core/docs/DEVELOPMENT_GUIDE.md#article-text-formatting-corebrowser-03).

This implementation wraps `ptt-client`, serializes terminal operations, and
translates PTT screens and prompts into the public core gateway contract.
The browser host must supply `Buffer` and a same-origin `/ptt-ws` WebSocket
proxy to `wss://ws.ptt.cc/bbs` with `Origin: https://term.ptt.cc`.
The repository development server supplies this proxy; other hosts must
configure it themselves.

UI authors should start with the core [Building a UI with @pttzzz/core](../core/docs/DEVELOPMENT_GUIDE.md).
Use `createBrowserClient()` from the package root and send operations through
the resulting `PttzzzClient`; terminal driver helpers are internal.

Run `npm test -w @pttzzz/browser` from the repository root to check the gateway
and terminal workflows. Core rule conformance is documented in the
[core README](../core/docs/README.md#fixture-符合性驗證).

Use `@pttzzz/browser/testing` for the fake browser gateway used by tests and previews.
