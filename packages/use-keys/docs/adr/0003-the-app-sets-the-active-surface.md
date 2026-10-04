# The app sets the Active Surface; keys never move between Surfaces

Surfaces look like the states of a state machine, so the obvious design gives them transitions: Ctrl+H moves from the inbox to the sidebar. We decided against it. The app already knows where the user is, through its router, its own state machine, or a mouse click that focused a pane, and a second copy of that kept by the keyboard drifts from it. So Surfaces only say what keys can do in each place, and the app names the Active Surface to the provider. Moving to another Surface is something an Action's Handler does, like anything else the app does.

## Considered Options

- **Surfaces with transitions, owned by the keyboard**: rejected. Every navigation that does not come from a key has to be synced back by hand.
- **Each screen declares its Surface by being mounted**: rejected. Which Surface is Active becomes hard to see in one place, and hard to set from outside the tree.
- **The provider keeps the Active Surface, with an initial value**: rejected. It is the same second copy, only smaller.

## Consequences

- The provider takes `surface` and `onSurfaceChange`, and nothing else; `setSurface` from anywhere calls `onSurfaceChange`.
- The central definition never names transitions or a default Surface.
- With no Active Surface, only the Global Actions work.
