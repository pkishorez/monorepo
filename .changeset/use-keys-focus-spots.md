---
'@kestack/use-keys': patch
---

Surfaces remember focus. `keys.useFocusSpot(surface, name, { default })` marks a named Focus Spot; a Surface remembers the spot focus was last in by its name, so it survives a remount, and coming back to the Surface by an Action, `enter`, `leave`, Escape or an Isolated Surface closing puts focus there again, else in its default spot, with Vim Mode on or off. A spot remounting while its Surface is Active takes focus back when focus fell to nothing, and focus is never taken from another Surface. Escape leaving a field is remembered as the Surface itself, so coming back stays in Normal Mode. `keys.checkBindings(bindings)` says, without throwing, which Actions the user's own keys would make Conflict on one Surface, which they would leave Shadowed by a nearer one, and which Bindings are invalid.
