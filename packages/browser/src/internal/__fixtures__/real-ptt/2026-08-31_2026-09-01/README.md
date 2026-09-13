# Real PTT terminal transcripts: 2026-08-31 / 2026-09-01

These transcripts were captured from `wss://ws.ptt.cc/bbs` on 2026-08-31/2026-09-01
through the browser terminal driver. Account identifiers, IP addresses and article
URLs are replaced with fixed-width placeholders. No password or credential is
stored here.

The fixtures document terminal states that are difficult to reproduce with
hand-written mocks:

- `login.txt`: duplicate-session prompt, successful continuation and main menu.
- `favorites.txt`: PTT reopening My Favorites at the remembered last page, then
  the same list after Home rewinds it to item 1.
- `filtered-write.txt`: a title-search `系列《Test》` article and the warning/input
  state that exposed writes being attempted from special-list mode.
- `post.txt`: Test board list plus the real category/title compose prompt.
- `delete.txt`: deletion prompt, progress screen and verified deleted row.

Keep these as transport fixtures: assertions should target stable labels, row
numbers, commands and transitions rather than changing timestamps or popularity.
