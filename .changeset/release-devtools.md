---
'@kestack/devtools': patch
---

Breaking: DevTools now hosts two Tools, Lotel and Monoverse, with Laymos opened inside Monoverse. The Flow Tool, its `/flow` route, `list-flows`, `get-flow` and `devtools snapshot` are removed, and so is the `/laymos` route. In `@kestack/devtools/rpc`, `NotPnpmWorkspaceError` is now `NoPackageJsonError`, and `FlowEntryEntitySchema`, `RegistryToolSchema` and `ProjectEntryEntitySchema` are gone.

Monoverse reads npm, yarn, bun and pnpm monorepos, and a single package too (including a pnpm one whose `pnpm-workspace.yaml` lists no `packages`), and draws Packages the way Laymos draws a Project, with changed, added and deleted ones marked. The Stories tab shows the new Laymos Stories, with recordings for browser Proofs, and only reloads the Proof files that changed.
