---
'@kestack/lint': patch
---

A new package: oxlint rules that keep a codebase's folders to the Kestack guidelines.

**Added**

- `kestack/imports`: a file imports any file in its own module, the index file of any module below it, at any depth, or, beside or above it, only a door's index file.
- `kestack/contracts`: the contract folders it is told to require exist, and a contract exports only `Context.Service` classes as values, everything else as types.
- `kabuki`, from `@kestack/lint/presets`: both rules set for a Kabuki app's folders.
