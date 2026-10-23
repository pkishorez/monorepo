---
'@kestack/web-platform': patch
---

`KeysHelp` takes `finalFocus`, handed to its dialog: `finalFocus={false}` leaves focus to the keyboard, so leaving the help sheet's Surface puts focus back where use-keys remembers it.
