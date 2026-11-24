---
'@kestack/monoverse': patch
---

A new package: the folder rules a package's `monoverse.json` names, checked by oxlint as you write and by DevTools' Monoverse on every branch.

**Added**

- `monoverse.json`, beside a package's `package.json`: `sourceRoots`, the folders checked; `ignore`, the files skipped; and either a `preset`, `"default"` or `"kabuki"`, or the package's own `rules`. A package without one is not checked. Its JSON Schema ships as `@kestack/monoverse/schema.json`.
- `monoverse/imports`: a file imports any file in its own module, the index file of any module below it, at any depth, or, beside or above it, only a door's index file.
- `monoverse/contracts`: the contract folders it requires exist, and a contract exports only `Context.Service` and error classes as values, everything else as types.
- `@kestack/monoverse/oxlint`: the oxlint plugin `monoverse`, with both rules and no options.
- `@kestack/monoverse`: the same rules with no oxlint in them, for a tool that reads a whole branch: `parseConfig`, `presets`, `isChecked`, `judgeImport`, `checkImport`, `importMessage`, `contractOf`, `missingContract`, and `diskTree` and `listTree` to read folders from the disk or from a list of files.
