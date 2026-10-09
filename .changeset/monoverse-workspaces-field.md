---
'@kstackz/devtools': minor
---

Monoverse reads npm, yarn, and bun monorepos as well as pnpm ones: a folder is a monorepo when it has a `pnpm-workspace.yaml` or a `workspaces` field in its `package.json` (an array, or yarn's `{ packages }`), and `pnpm-workspace.yaml` wins when both exist. The Monoverse header names the Package Manager, and `AnalyzeMonorepo` returns it as `packageManager`. `NotPnpmWorkspaceError` from `@kstackz/devtools/rpc` is renamed `NotAMonorepoError`, and its `path` is now the folder rather than its `pnpm-workspace.yaml`.
