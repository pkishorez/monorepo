# A Window Compacts the History into a Restore

A History grows by one entry per Message, and Replay remembers a Snapshot for each live one, so a long-running app slows the page. A History can have a Window: how many entries it keeps on the Head's Branch, none by default. It is set when the History is made, or at any time with `history.keep(n)`, even while a Runtime runs, since Compacting never moves or removes the Head. After every append and every change of Window, the History Compacts: the oldest entry kept becomes a Restore of the Snapshot right after it, with its own id and Time and no parent, and every entry that does not grow from it is swept, on any Branch. Doing it twice is doing it once.

The Restore already is how a Snapshot enters a History ([ADR 0021](0021-an-app-is-saved-as-its-log-and-drawn-before-it-runs.md), [ADR 0025](0025-the-runtime-starts-from-a-history.md)), so a Compacted History needs nothing new to replay, save, load or draw: init stays the first Step, then the Restore. Taking over the oldest kept entry's id means no entry is renumbered, so a Step shown, an outcome or an Inspector pick keeps pointing at the same entry. The price is that ids no longer are positions: a saved History's ids rise, but may start anywhere and skip.

## Considered Options

- **A base Snapshot beside the entries, `{ base, entries, head }`**: rejected. A second way in, which ADR 0025 rejected for the same reason.
- **Renumber the kept entries from 0**: rejected. Every id held outside the History, the Step shown first, would point somewhere else after each Compact.
- **Count every entry on every Branch, and drop the oldest by id**: rejected. It leaves entries whose parent is gone.
- **Keep only the Head's Branch**: rejected. It throws away recent Branches for nothing.
- **Compact only every so many entries**: left for when the History is persisted, where each Compact is a write. In memory it is cheap enough to do on every append.

## Consequences

- What the folded Messages did is kept only as the Restore's Snapshot. Code changed later never plays them again; a Snapshot that no longer fits its Schemas is warned of and skipped, as any Restore is, and the app starts from init.
- Time Travel reaches init, the Restore, and the Window, nothing before. A Step shown that is Compacted away shows the Restore.
- Moving the Head back and growing a new Branch drops the old one once the oldest kept entry passes where they split.
