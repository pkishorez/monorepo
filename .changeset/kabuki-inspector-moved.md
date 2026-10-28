---
'@kestack/web-platform': patch
'@kestack/devtools': patch
---

The Kabuki Inspector moved into DevTools, rebuilt on a canvas over a Timeline, with Time Travel and Fork.

Breaking: `KabukiDevtools` and `Inspector` are gone from web-platform, and `story` is no longer played. `recipes/devtools` keeps `DevtoolsDock`.
