---
'@kestack/use-keys': patch
---

A component draws again only when what it reads of the keyboard changes.

**Added**

- `keys.useMoves()`: `enter` and `leave` alone, the same functions on every draw, never drawn again as the user moves.
- `keys.useVim()`: Vim Mode alone, drawn again only as it turns on or off.
- `keys.useSurface(name, { enabled: false })` reads the Surface as Off and draws nothing again, for one of many popups sharing a Surface while it is closed.

**Changed**

- `useAvailableActions` gives the same list, and each Action the same `run`, while what works stays the same, so a Handler added or removed for an Action already working draws no help sheet or palette again.
- A Handler mounting tells the store once, not twice.
- Each Binding's words are worked out once, as the store describes every Binding whenever what works changes.
