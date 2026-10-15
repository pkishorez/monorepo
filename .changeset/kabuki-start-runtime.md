---
'@kestack/kabuki': patch
---

`Start.useRuntime()` reads the running app from the Document, so a Start app can draw Kabuki's devtools around itself. It is `null` on the server, which runs no app.
