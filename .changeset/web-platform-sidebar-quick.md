---
'@kestack/web-platform': patch
'code': patch
---

The App Shell's sidebar opens and shuts smoothly beside a long page. Its values no longer pass down to the page, so moving it restyles only the sidebar, the page and the page's dim, not every element in the page; the theme registers them as not inherited (`ui/theme/css/frame.css`, in `global.css`). The open state is `data-sidebar` on the shell and each of those, in place of `data-state`, which other rules read on ancestors, so a change to it restyled the whole page. Dragging the sidebar's edge gains the same.
