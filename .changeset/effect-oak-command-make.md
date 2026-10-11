---
'effect-oak': patch
---

A Command is made once with `Command.make(name, { args, run })`: a name, the Schema of its args and the Effect it runs from them. An Update asks for it by calling it with its args, `{ command: save({ id }) }`, which gives plain data, `{ name, args }`, that a test can compare without running it. The args are checked against their Schema when the Command runs; a mismatch is reported like any Command failure. Breaking: an inline `{ name, run }` is no longer a Command. There is still no cancel; "latest wins" is a Worker keyed on the Model. See ADR 0024.
