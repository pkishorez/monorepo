# The Log is a tree, and the Runtime runs it in memory

The Log is a tree of entries, one per Message, each pointing to its parent. A Head says where the next Message goes. `stop()` interrupts all work at once; `start(from)` Replays the path to `from`, goes live from there, and grows a new Branch, with Time carrying on from `from`'s Time. The Log is one in-memory value owned by the Runtime: an append-only array of entries, the Head, whether it is running and the entry shown, in a plain `{ get, subscribe }` store. It is the only source of truth for the Runtime, Replay, `useRuntime()` and timelines. Details are in [the design](../log-tree.md).

## Considered Options

- **A flat Log, starting over on every start**: rejected. Starting from an old entry would throw away everything after it.
- **The store as the queue (write first, then Update from its subscription)**: rejected. Every Message would wait for a write (keystrokes would lag), the outcome would need a second write, order would follow write completion, and subscriptions would bring in other tabs' writes.
- **The Log in a std-toolkit table, in its own Layer, written in the background, with a fresh start when stored Messages no longer decode**: rejected for now. Nothing needs persistence yet, and it brought a dependency, async writes and a second copy of the truth. Persistence comes later as saving and loading the one value.
- **A `SubscriptionRef` for the state**: rejected. React reads `{ get, subscribe }` with `useSyncExternalStore`, and the Runtime changes the state synchronously.
- **Keeping running Commands alive across a stop, or re-running them at a fork**: rejected for now. A Command can be non-interruptible or not idempotent, and nothing says which. Stop interrupts everything; work that must survive belongs in a Lifetime.
- **Start and Stop as entries in the Log**: rejected. A Branch begins wherever an entry has a second child, and running is the live Runtime's state, not something to keep.

## Consequences

- The Log is gone when the page is. Persistence is later work.
- Commands running at a stop are lost, and `init`'s Commands never run again after the first start. A first fetch is a Lifetime.
- Starting from an old entry does not rewind the outside world.
- Starting from a deep entry Replays from the start until there are snapshots.
