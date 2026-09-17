# Monoverse hosts Embedded Laymos over its canvas

Opening a Package in Laymos from Monoverse renders the full Laymos Project
workspace inside the `/monoverse` route, over the Monoverse canvas, which stays
mounted underneath. The open Package's name travels in the `laymos` URL search
param alongside `monorepo` and `package`, so it survives reloads, can be shared,
and browser Back closes Embedded Laymos and returns to the canvas exactly as it
was left: viewport, Package focus, and Dependency kind filters all intact.

Embedded Laymos reuses the Laymos Tool's Project workspace with the Project
fixed to the Package folder. It never adds that Project to the Laymos Tool's own
list; the crumb back to the Monorepo replaces the project picker.

We considered a separate `/laymos` navigation that saves and restores the
Monoverse viewport. That would either lose the canvas state on every round trip
or need a serialised viewport in storage, and it would blur the Tool boundary by
making the Laymos Tool aware of Monoverse. Keeping the canvas mounted and the
open Package in Monoverse's own URL is simpler and matches
[ADR 0003](./0003-adaptive-tool-workspaces.md): major selections belong in the
URL and browser history.
