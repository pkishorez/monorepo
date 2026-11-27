---
'@kestack/devtools': patch
---

Monoverse checks each Package by its `monoverse.json` with `@kestack/monoverse`, the same engine `monoverse lint` runs, so its counts and messages are the CLI's.

**Added**

- A Package with a `monoverse.json` is checked on the server by `@kestack/monoverse`: only the files its `sourceRoots` hold and its `ignore` leaves. Each import, each contract, and its `exceptions` and `restrictions` are judged exactly as `monoverse lint` judges them, and each Violation carries the CLI's own message, line and column. A restriction's message gives its reason.
- Imports are followed as the check follows them, in the check and in the drawn import graph alike: relative paths, tsconfig `paths`, package.json `imports`, and a package naming itself.
- An exception that lets nothing through, or a restriction that covers no checked file, is a Violation on the Package's `monoverse.json`: it shows on that file and rolls up to its folders and the Package.
- Every branch is checked the same way. For a branch no worktree has checked out, its whole commit, symbolic links included, is written once to a folder under the OS temp folder, keyed by the commit, with the checkout's `node_modules` linked in, and checked there, so a project inside a larger repository still reads the tsconfig and `node_modules` above it. The copy is reused on later opens while it is whole, and only the last few are kept.
- The check runs in a worker thread, so a large project never holds up the rest of the server.
- The repo view and the Package lists show each checked Package's Violation count, a quiet shield when it has none, and a warning when its `monoverse.json` cannot be read. A Package without one shows nothing.
- In a Package, each file and folder shows how many Violations it holds. A selection's count opens a list of what is wrong and what to do, each at its file, line and column, named from the Package.

**Changed**

- The import graph covers every source file git knows in a Package, tests and scripts included. Only the checked files can hold a Violation.
- Source roots come from `monoverse.json`. `laymos.config.json` is no longer read.
- `@kestack/monoverse` is a dependency, installed with its native `oxc-parser` and `oxc-resolver`, rather than bundled into the CLI.

**Removed**

- Monoverse's own Folder rule, which forbade importing a file directly in an ancestor folder.
