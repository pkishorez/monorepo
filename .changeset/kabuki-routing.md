---
'@kestack/kabuki': patch
---

Add routing, in `@kestack/kabuki/routing`, a layer core never imports. Write every place once with `Route.tree` and `Route.path`; put `Router.app` above the app's root, and it holds the history, hands the current Route down as Props, and takes every move as one Message. A node with child Routes serves them with its `outlet`. It routes in memory by default; give `browser()` from `@kestack/kabuki/routing/browser` or `tanstack()` from `@kestack/kabuki/routing/tanstack` in the Layer to put the address in the URL. `toReact` takes the root's Input as a new `input` option, read once when the app first makes its History, and core exports the types `Actor.make(...).build` is checked with.
