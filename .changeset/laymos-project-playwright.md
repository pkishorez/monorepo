---
'laymos': patch
'@kestack/devtools': patch
---

Browser stories load `playwright-core` from the project first, as they do Vite, so they run from DevTools' bundle too.
