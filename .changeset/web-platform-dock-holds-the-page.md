---
'@kestack/web-platform': patch
---

The Devtools Dock keeps the page in its own box and layer, so a page that raises its own `z-index` no longer paints over the devtools, and a page taller than the room a docked bar leaves scrolls in that room instead of running under the bar. `VimWindow` fits a box with a height, such as that room, instead of always taking the screen's height.
