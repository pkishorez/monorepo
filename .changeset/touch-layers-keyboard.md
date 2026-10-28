---
'@kestack/web-platform': patch
---

Drawers and Top Dialogs stay above the iOS 26 on-screen keyboard. A focused field scrolls into view inside its layer, not by scrolling the page.

New: `useVisibleViewport`, `visibleOf`, `useKeyboardOver`, `overBox`, and `SWIPE_DISMISS` for sheets that dismiss like the Drawer.
