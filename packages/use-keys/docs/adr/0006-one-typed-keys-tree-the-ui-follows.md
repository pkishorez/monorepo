# One typed Keys tree, and the UI follows the Active Surface

Supersedes the part of [0005](./0005-surfaces-are-components.md) that makes Surfaces mounted components nested by the React tree. 0005's other decision stands: the Keys Provider holds the Active Surface, not the app.

With Surfaces as components, the React tree was the Surface tree, and a Surface existed only while mounted. Both hurt. A composer drawn beside its session, or a palette in a portal at the root, landed in the wrong place in the keyboard. A palette could not be entered before it was drawn, so opening one meant setting app state, waiting for it to mount, and letting the mount enter it: the UI drove the keys. Names were plain strings, with no help from the compiler.

So the definition is central and typed again: `createKeys` names every Surface, as they nest, and the Actions on each. That Keys tree is the only hierarchy. `keys.Surface` draws a Surface wherever it sits in the page, any number of times, and `keys.useAction` gives an Action its Handler. The definition holds no transitions by app state, as 0003's did: the provider holds the Active Surface, entering one always works at once, drawn or not, and the UI follows it. A palette is drawn while `useSurface('palette').active`, and leaving the Surface closes it.

## Considered Options

- **Surfaces as components, nested by the React tree (0005)**: rejected, for the drift and the mount-driven opening above.
- **A central definition with the app holding the Active Surface (0003)**: rejected again. Every click, focus change and Escape would have to be synced back to it.
- **Nesting by the DOM tree**: rejected. It drifts the same way, and portals break it.

## Consequences

- Surface names are flat and unique across the tree; a name used twice fails to compile, and throws. Action ids are `'<surface>.<action>'`, typed, and so are the user's own Bindings, a Provider prop again.
- An Action with neither a Handler nor `enters` does nothing and Shadows nothing, so the definition can name every Action up front.
- An Isolated Surface is no longer entered when it mounts. It is entered like any other, and remembers where it was entered from.
- States come from the Keys tree only: Active, Parent, Inactive, and Off with Vim Mode off. An Active Surface drawn inside an Inactive element is dimmed with it; development warns once.
- Shadowing stays static, as in [0004](./0004-shadowing-is-static.md), and the Escape order is unchanged.
