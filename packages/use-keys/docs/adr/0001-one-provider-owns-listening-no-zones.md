# One Keys Provider owns listening; keys have no zones

use-keys is the keyboard counterpart of use-gesture. It keeps the Keys Provider but drops zones. A touch lands somewhere, so use-gesture needs zones to decide which part of the screen hears it. A key has no position, only focus, and focus often sits on the page itself. So the Keys Provider listens to the whole page, keeps the list of every listener inside it, and calls each Enabled one with every Key Press. Every listener must be inside a Keys Provider. One inside another adds nothing: its listeners join the outer one, so a component can wrap itself in one. The app keeps listeners apart with `enabled`, driven by its own state, as in use-gesture's ADR 0004. The provider's own `enabled` turns off every listener in it.

## Considered Options

- **No provider: one list for the whole page, kept by the package**: rejected. A provider gives one clear owner of the listener, the Held Keys, the warnings and what devtools show.
- **Zones scoped by focus, like Gesture Zones**: rejected. Clicking plain content does not move focus, so a zone either steals focus or is often silent.
- **Nested providers that combine their `enabled`**: rejected. "A nested provider adds nothing" is one rule, the same as use-gesture.
- **An error for a nested provider**: rejected. A component could no longer wrap itself in one.
- **A listener outside a provider does nothing**: rejected. Shortcuts that silently never work are worse than an error at once.

## Consequences

- A listener outside every Keys Provider throws.
- Only the outermost provider's `enabled` counts; development warns about `enabled` on a nested one.
- The provider knows the keys of every Enabled Shortcut and Sequence in it, so it finds a Conflict as soon as a listener is Enabled: development throws; production warns, and the one Enabled first keeps the keys.
- Sibling providers each listen to the whole page, so both hear every key and neither warns about the other. One provider per app is the usual setup.
- Multi-pane screens keep an "active pane" in state and pass it to `enabled`.
- A later state machine can drive `enabled` from its state without the API changing.
