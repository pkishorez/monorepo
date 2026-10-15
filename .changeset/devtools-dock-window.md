---
'@kestack/web-platform': patch
---

`DevtoolsDock` takes `scrolls: 'window'` for a site whose page scrolls the window: the page stays in the document's flow, keeping its sticky headers and scroll restoration, and the bottom bar or side panel is fixed over it, with the body padded by its size.
