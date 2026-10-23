---
'code': patch
---

Device State: what this browser keeps for itself, the user's own keys, Vim Mode and Unseen marks, now lives in one IndexedDB database of its own instead of localStorage, and the root page reads it before drawing anything. The app is one chain: Device State, then the connection and the Replica, then the pages. A change made in one tab shows in the others.

Settings lists every Action of the keyboard by Surface, with a search. Clicking an Action's keys records the next key pressed in their place; while it records no key of the app works, and Escape or a click away keeps the old keys. A key another Action on the same Surface has names it and offers to swap their keys; a key a nearer Surface has is allowed, with a note. Each Action resets on its own, or all at once, and the `?` sheet lists the keys as bound. Resetting an Action whose defaults another Action has now, as after a chain of swaps, resets that one too, and so on, and the row says which went with it; keys read back that no longer fit are dropped until what is left has no clash. An Unseen mark only moves forward, even when two tabs write it at once.

Every Picker key is now an Action of the `picker` Surface, listed by `?` and rebindable: Enter picks, Mod+Enter finishes, the arrows and Ctrl+N/Ctrl+P move, and cmdk no longer acts on them. A Picker its owner closes while it is open hands the keyboard back, so the keys never stay in a Picker no one draws. Closing the `?` sheet puts focus back where the keyboard remembers it.
