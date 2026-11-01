---
'@kestack/web-platform': patch
---

The App Shell's sidebar opens and closes smoothly beside a long page, because moving it no longer restyles the whole page. **Breaking** for custom CSS: the shell's open state is `data-sidebar`, not `data-state`. The theme registers the sidebar's values as not inherited in `ui/theme/css/frame.css`, included by `global.css`.
