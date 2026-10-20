---
'@kestack/devtools': patch
---

The DevTools UI keeps its Theme as every kstack app does, in the `kui-theme` cookie, and follows the system's setting until one is picked, in place of a `localStorage` value that started dark.
