# Goal 7 PTT Reply State Design

## Goal

Align pttzzz reply controls with native PTT author restrictions, make board-reply success detection cover the real terminal flow, and expose actionable push failure reasons without risking duplicate submissions.

## Scope

This change covers three related behaviors:

1. An article author may only use the neutral `→` push type when replying to their own article, including replies to an existing floor.
2. A native reply-to-board operation must recognize PTT's post-success continuation screen and restore the terminal to a stable board state.
3. A push failure must report the stage that failed and may retry only while no user content has been sent.

It does not change vote aggregation, floor parsing, article score definitions, or PTT board permissions.

## Author Reply Restriction

`Article` already compares the logged-in ID and article author case-insensitively. It will pass that result to `Composer` as a neutral-only constraint for both `reply` and `reply-push` modes.

When the constraint is active:

- `推` and `噓` are disabled and visually muted.
- `→` is selected when the composer opens.
- The selector displays the native PTT wording: `作者本人, 使用 → 加註方式`.
- Submission coerces the outgoing type to `neutral` as a second guard against stale component state or programmatic submission.
- Edit-push mode is unchanged because its formatter already sends edits as neutral pushes.

The existing article vote controls remain disabled for the author. Their explanatory copy will use the same native PTT wording for consistency.

## Native Reply-to-Board Confirmation

The adapter will continue to drive the existing PTT flow: choose board reply, accept the original title, enter the editor, save, answer category rules, and select no signature.

The completion phase will additionally recognize `按任意鍵` / `請按任意鍵繼續` as a post-success continuation screen. It will press Enter, then restore the requested board with `ensureNormalBoardView` before returning success.

If completion remains uncertain:

- The adapter will attempt to restore the requested board before returning.
- It will return a phase-specific reason instead of claiming success.
- It will not resend the article body because the original save may already have succeeded.

## Push Submission Results and Recovery

Push submission will return `ActionResult` with an optional machine-readable failure code and a user-facing reason. The relevant phases are:

- `push-entry-timeout`: PTT did not show the push-type menu or content prompt. No content was sent.
- `push-content-prompt-timeout`: a type was selected but PTT did not show the content prompt. No content was sent.
- `push-confirm-timeout`: content was entered but PTT did not show a send confirmation. The result is uncertain.

For the first two codes, the article UI may reload the target article and retry once because no content has been sent. For `push-confirm-timeout`, it must not retry and must ask the user to reload/check the article, preventing duplicate pushes.

The composer will display `result.reason` instead of replacing it with the generic `回文送出失敗` message. Existing callers that only inspect `ok` remain compatible.

## Error Handling

- Empty input and unsupported bot methods keep their existing behavior, with a concrete reason added where possible.
- Recovery is limited to one attempt.
- A failed recovery leaves the composer and draft open.
- Returning to a board is terminal-state cleanup, not proof that an uncertain article was published.

## Tests

Tests will cover:

- Article authors see disabled `推` and `噓`, selected `→`, and the native PTT message in both reply modes.
- Programmatic author submission still sends `neutral`.
- Non-authors retain all three push types.
- Reply-to-board handles the continuation screen and returns to the board.
- Reply-to-board uncertainty cleans up terminal state without resending content.
- Each push failure phase returns the intended reason/code.
- Safe pre-content failure retries at most once; post-content uncertainty never retries.
- Composer renders the adapter-provided reason.
