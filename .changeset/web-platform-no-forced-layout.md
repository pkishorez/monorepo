---
'@kestack/web-platform': patch
---

The header no longer lays the page out on every change to it, and Vim Mode is instant.

**Changed**

- The App Shell header said whether the page was scrolled under it by reading the scroller's position after every change to the page, which laid the whole page out at once each time, as each word streamed in too. It now reads the position only as the page scrolls, and after a change only whether that scroller is still there.
- With Vim Mode on, a Surface lights and dims at once rather than over 100ms, and what dims behind an open dialog or popover is not blurred, so nothing under it is drawn again frame after frame.
