# @pttzzz/browser

Official browser gateway and client factory for `@pttzzz/core`.

The current package version is `0.1.0`, targeting rules `0.1.x`. See
[package.json](./package.json) for dependencies and compatibility declarations.
These declarations do not establish npm publication status.

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
