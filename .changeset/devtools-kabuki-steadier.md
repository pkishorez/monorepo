---
'@kestack/devtools': patch
'@kestack/devtools-kabuki': patch
'code': patch
---

Kabuki in DevTools is steadier: the `/kabuki` list survives a server restart, follows each app's page, and waits for a Session's first answer. DevTools works at `localhost` as well as `127.0.0.1`.
