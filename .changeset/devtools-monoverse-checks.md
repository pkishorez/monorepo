---
'@kestack/devtools': patch
---

Monoverse checks each Package by its `monoverse.json`, with the same rules `vp lint` runs, and shows what it finds.

**Added**

- A Package with a `monoverse.json` is checked on the server by `@kestack/monoverse`: only the files its `sourceRoots` hold and its `ignore` leaves. Each Violation carries the lint's own message.
- The repo view and the Package lists show each checked Package's Violation count, a quiet shield when it has none, and a warning when its `monoverse.json` cannot be read. A Package without one shows nothing.
- In a Package, each file and folder shows how many Violations it holds. A selection's count opens a list of what is wrong and what to do.

**Changed**

- The import graph covers every source file git knows in a Package, tests and scripts included. Only the checked files can hold a Violation.
- Source roots come from `monoverse.json`. `laymos.config.json` is no longer read.

**Removed**

- Monoverse's own Folder rule, which forbade importing a file directly in an ancestor folder.
