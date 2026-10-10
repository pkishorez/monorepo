# The Log is a tree, and the Runtime runs in memory while a store remembers

The Log is a tree of entries, one per Message, each pointing to its parent. A Head says where the next Message goes. `stop()` interrupts all work at once; `start(from)` Replays the path to `from`, goes live from there, and grows a new Branch, with Time carrying on from `from`'s Time. The Log is kept in a std-toolkit table given to the Runtime in its own Layer, in memory unless the app gives it another. The Runtime orders and handles every Message in memory and writes its entry afterwards, in order, without waiting. Boot reads the Head and Replays the path to it. Details are in [the design](../log-tree.md).

## Considered Options

- **A flat Log, starting over on every start**: rejected. Starting from an old entry would throw away everything after it.
- **The store as the queue (write first, then Update from its subscription)**: rejected. Every Message would wait for a write (keystrokes would lag), the outcome would need a second write, order would follow write completion, and subscriptions would bring in other tabs' writes.
- **Keeping running Commands alive across a stop, or re-running them at a fork**: rejected for now. A Command can be non-interruptible or not idempotent, and nothing says which. Stop interrupts everything; work that must survive belongs in a Lifetime.
- **Start and Stop as entries in the Log**: rejected. A Branch begins wherever an entry has a second child, and running is the live Runtime's state, not something to keep.
- **A Log-store Service of effect-oak's own, with std-toolkit as an adapter elsewhere**: rejected. std-toolkit already has entities, indexes and Memory, IndexedDB and SQLite adapters; only the subpaths used reach the bundle.

## Consequences

- If the tab closes between Update and the write, the last Message or so is lost from the store.
- Commands running at a stop are lost, and `init`'s Commands never run again after the first boot. A first fetch is a Lifetime.
- Starting from an old entry does not rewind the outside world.
- A stored Branch the current code can't decode is left in the store, and boot starts fresh.
- Starting from a deep entry Replays from the start until there are snapshots.
