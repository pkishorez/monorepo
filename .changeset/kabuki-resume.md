---
'@kestack/kabuki': patch
---

An app can carry on where it was after its process starts over. `history.changes` streams the History as plain JSON, now and after every change, so a server saves it with Effect's own `Stream.debounce` and `Stream.runForEach`, and `running.changes` streams the live Snapshot the same way; a slow reader of either gets only the latest. `History.load(actor, saved, { onMismatch: 'fail' })` throws when what was saved no longer fits the code, where the default still warns and skips it. The docs say when to use Time and when a real date belongs in the Message.
