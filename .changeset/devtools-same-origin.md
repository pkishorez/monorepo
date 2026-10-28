---
'@kestack/web-platform': patch
'@kestack/devtools': patch
---

Under `vite dev`, `app()` forwards Kabuki Sessions at `/__devtools/kabuki/connect` on the site's own origin to DevTools, and nothing else of DevTools. `app({ devtools })` sets the server, or `false` for none.
