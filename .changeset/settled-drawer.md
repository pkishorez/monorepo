---
'@kestack/web-platform': patch
---

A touch Drawer holding a field stops animating on its own once it has risen, so on iOS it no longer jitters against the keyboard: the keyboard and the page's scroll move and size it at once, and only a swipe or closing animates it.
