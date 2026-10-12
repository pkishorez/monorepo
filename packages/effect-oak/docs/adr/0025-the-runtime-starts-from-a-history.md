# The Runtime starts from a History, never a Snapshot

The Runtime takes one thing to start from: a History, made for one Actor and the root's Input. `Runtime.start(history, layer)` carries it on from its Head, and `Runtime.start(Auth, layer)` is the same with a new, empty History. The History needs nothing else to tell the Snapshot right after any entry: it replays its own Messages. The Runtime appends to it, keeps its Head in place while it runs, and hands it back as `history`.

A Snapshot on its own is not a second way in. `History.restored(Auth, snapshot, at)` makes the History of one Restore right after init, so a Snapshot is just the smallest History, and time travel still reaches init before it.

A saved History is its entries and its Head, nothing else. Whether the Runtime runs belongs to the Runtime, and which Step is shown belongs to whoever is viewing (the App), so neither is saved. Starting always goes live at the Head, with Time carried on from the Head's Time, for a resume and for a branch alike.

## Considered Options

- **Take a Snapshot and a History together**: rejected. A Snapshot that disagrees with the History's Head has no right answer.
- **Take either one, never both, checked by the types**: rejected. Two ways in for one idea, when the Restore already turns one into the other.
- **Keep `running` and `shown` in the saved History**: rejected. They are not what happened, and keeping them made the History, the Runtime and the viewer share state.
- **Resume at the Time the Runtime stopped**: rejected. It needs memory the History does not have, and no Message happened in between.
