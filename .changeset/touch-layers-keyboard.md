---
'@kestack/web-platform': patch
---

A Drawer and a Top Dialog stay above the on-screen keyboard on iOS 26 and later, where they slid under it: iOS pans the page under the keyboard and shrinks `innerHeight` by as much, so the keyboard is now measured from the layout viewport's own height, `documentElement.clientHeight`, less what `visualViewport` shows. It is read again only on the browser's own events, `visualViewport`'s `resize`, `scroll` and `scrollend`, the window's `resize` and focus moving, never on a timer. A focused field in a layer is scrolled into sight inside it, never by scrolling the page, once as it takes focus and again as the keyboard takes room from the layer, keeping its scroller's `scroll-padding` and its own `scroll-margin` clear.

`useVisibleViewport` and `visibleOf` give that measure to a layer fixed to the page; `useKeyboardOver` and `overBox` give it to a box in the page's flow, such as a sheet in a column, with whether the keyboard is up. `SWIPE_DISMISS` is the Drawer's rule for a swipe down that closes it, 80px or a flick of 500px/s, for an app's own sheet to dismiss alike.
