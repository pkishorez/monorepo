---
'@kestack/std-toolkit': patch
'@kestack/connect': patch
'@kestack/devtools': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
'@kestack/rpc-toolkit': patch
---

Breaking: std-toolkit's subpaths follow its five parts, `schema`, `db`, `sync`, `replica` and `deploy`.

- `@kestack/std-toolkit/core` and `@kestack/std-toolkit/eschema` become one subpath, `@kestack/std-toolkit/schema`, with the same exports, except that `Broadcaster`, `defaultBroadcaster`, `sharedBroadcaster` and `ChangeNotice` now come from `@kestack/std-toolkit/db`.
- `@kestack/std-toolkit/eschema/testing` becomes `@kestack/std-toolkit/schema/testing`.
- `@kestack/std-toolkit/snapshot` becomes `@kestack/std-toolkit/schema/snapshot`.
- `@kestack/std-toolkit/alchemy` becomes `@kestack/std-toolkit/deploy`.
- `@kestack/std-toolkit/snapshot/vitest` is gone: `expectTableShippable` from `@kestack/std-toolkit/db/testing` is the one table test, and the file check it is built on is no longer public.
- `@kestack/std-toolkit/db` also exports `BuiltTable`, the type `StdTable` names, so a package that exports a table builds its declarations.

`db/*`, `sync/*`, `replica/*` and the SQLite drivers keep their paths. Every import in the monorepo moved to the new paths.
