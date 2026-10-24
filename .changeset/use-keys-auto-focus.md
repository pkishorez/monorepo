---
'@kestack/use-keys': patch
---

`keys.Provider` takes `autoFocus`, on by default. Off, focus no longer follows the Active Surface on its own, into a default Focus Spot or back to the spot last in: it goes only where the user puts it, and a Focus Spot mounting again, as a Dialog's search reopened, takes none. Turn it off on a device with no keyboard, where a field taking focus raises the on-screen keyboard.
