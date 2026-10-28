---
'@kestack/devtools': patch
---

DevTools has a Kabuki Tool at `/kabuki`: the live Kabuki Sessions down the left, appearing and leaving as apps connect and close, and the Inspector on the one picked, travelling the real app. `?session=<name>` opens a Kabuki Session directly, and waits for it while it is not connected. With none connected, the page shows how to attach `connect`.
