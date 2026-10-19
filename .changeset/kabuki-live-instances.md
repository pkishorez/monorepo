---
'@kestack/kabuki': patch
---

Code outside the tree reaches a running app, typed: `running.instance({ from: 'admin' })` gives the root Instance, always live, and every Instance below it, narrowed by State through `_tag`, keyed Children as a list and one that may be absent as `undefined`. Each reads its Model, State, Props, Children and Workers as they are now, and `send` hands it a Message from outside, named by `from`, and says whether it arrived. `App.useRuntime()` gives the same. A Runtime started from an Actor now keeps no Messages, only the app as it is now: give it `History.make(actor)` to keep them all. An app made with `toReact` keeps the last 100 by default, and a Window may now be 0.
