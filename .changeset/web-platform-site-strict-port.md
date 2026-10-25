---
'@kestack/web-platform': patch
---

Under `alchemy dev`, a `Site` stops if Portless's port is already taken, instead of quietly serving on the next one while Portless still sends its host to the old port, which another app holds.
