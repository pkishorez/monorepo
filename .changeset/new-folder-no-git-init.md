---
'@kestack/connect': patch
---

A new folder is only a folder: `createFolder` no longer starts a git repository in it.

**Changed**

- `createFolder` makes the folder and nothing else. Whoever wants a repository there starts one.

**Removed**

- `gitInitError` from `CreatedFolder`.
