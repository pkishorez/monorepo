---
'effect-oak': patch
---

Breaking: the Log is a tree, and the Runtime stops and starts from any entry (ADR 0007). Each Log entry has an `id` (its position) and a `parent`, and `instance` replaces `id` for the Instance's number; `Sent` is gone. `Running.root` is now a function, `Running.sent` is gone, and `Running.log()` is the current Branch. `Running` gains `state`, `drawn`, `children`, `show`, `stop` and `start(from?)`, and `Runtime.start` takes an optional saved `RuntimeState` to carry on from. `Replay.make(node)` no longer takes the Messages: `seek(branch)` shows the tree right after a Branch's last entry. `App.useRuntime()` returns `{ log, head, running, shown, show, stop, start, children, frame }`, and `show` takes an entry id instead of a Step. `stop()` interrupts every Command and Lifetime; `start(id)` Replays the path to an entry and grows a new Branch from it, with Time carrying on from its Time.
