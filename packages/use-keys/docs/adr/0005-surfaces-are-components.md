# Surfaces are components, and the Keys Provider holds the Active Surface

Partly superseded by [0006](./0006-one-typed-keys-tree-the-ui-follows.md): Surfaces are named in one typed Keys tree again, not nested by the React tree. The Keys Provider still holds the Active Surface.

Supersedes [0003](./0003-the-app-sets-the-active-surface.md), and the "one central definition" of Surfaces and Actions.

`createKeys` named every Surface and Action in one central definition, apart from the components that draw them, and the app said which Surface was Active. In a real app the two trees drifted: a pane moved in the UI but not in the definition, a dialog drawn inside a session was a sibling in the keyboard, and every click had to be turned into `setSurface` by hand. So a Surface is now a component. The React tree is the Surface tree: the nearest Surface above one is its parent, portals included, and an Action attaches to the Surface it is rendered in. The Keys Provider holds the Active Surface, because what moves it is what it can see: a pointer going down or focus moving inside a Surface, an Isolated Surface mounting or unmounting, and Escape. The app still moves it from an Action with `enter`, and still holds Vim Mode, which is a preference it keeps.

## Considered Options

- **One central definition, `createKeys`**: rejected. The UI and the key hierarchy drift apart, and Surfaces that mount and unmount with the UI, such as a picker, have to be opened and closed by hand.
- **The app holds the Active Surface, as in 0003**: rejected. Every click, every focus change and every dialog closing has to be synced back to it, which is the drift 0003 wanted to avoid, the other way round.
- **Focus decides the Active Surface outright**: rejected. Focus often sits on the page itself, and going there would leave every Surface; focus can move the user in, never out.

## Consequences

- Ids are no longer typed by a definition; they are unique among the mounted Surfaces, and development throws on a duplicate.
- There are no Global Actions: the outermost Surface holds them. An Isolated Surface cuts off every Surface outside it, so `globals: false` is gone.
- The user's own Bindings are no longer a provider prop: an Action's `keys` are a prop like any other, read from wherever the app keeps them.
- Every Action is Vim only unless it says `always`, and Vim Mode off still keeps the Active Surface moving, so the Always Actions work where the user is.
- Escape follows one order, and only the Active Surface's own Escape Action runs; Escape Actions of the Surfaces around it never do.
- Shadowing stays static, as in [0004](./0004-shadowing-is-static.md).
