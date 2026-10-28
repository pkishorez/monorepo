---
'@kestack/web-platform': patch
---

A Drawer and a Top Dialog stay above the on-screen keyboard on iOS 26 and later, where they slid under it: iOS pans the page under the keyboard and shrinks `innerHeight` by as much, so the keyboard is now measured from the layout viewport's own height, `documentElement.clientHeight`, less what `visualViewport` shows. A focused field in a layer is scrolled into sight inside it, never by scrolling the page, and the keyboard is read again as it rises, falls and changes height, as for emoji.

`useVisibleViewport` and `visibleOf` give that measure to a layer fixed to the page; `useKeyboardOver` and `overBox` give it to a box in the page's flow, such as a sheet in a column, with whether the keyboard is up.
