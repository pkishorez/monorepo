---
'@kstackz/web-platform': minor
---

`DiffViewer` takes `options` and `onOptionsChange`, so a caller can keep Expand all, Wrap, Unified and the shown sides from one file to the next, and `autoHeight`, which grows it to its full height under a sticky toolbar; `defaultDiffOptions` is exported. On a phone it reads Unified and wrapped, with Expand all and Wrap in a menu. The git changes viewers know a deleted path, and `ChangesMenu` offers Include deleted with `offerDeleted`. `FileTree` rows carry `data-path`. The Sidebar pieces of `recipes/frame` now live with its sidebar; its exports are unchanged.
