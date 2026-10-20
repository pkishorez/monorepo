# Each Layer is written beside what Requires it

Partly superseded by [ADR 0041](0041-the-loaders-layers-are-made-once-and-per-visitor.md): the Loaders' Layers are `Start.server({ layer, visitor }).loaders(loaders)`, not tiers made from the env, and the app is `Start.app({ router, view, document, layer })`. Each Layer written beside what Requires it stands.

An app hands Start three files: its Routes, `src/app` and `src/loaders.server`. The Layers the Loaders Require are given in `src/loaders.server`, as `Start.layers<Env>()…loaders(loaders)` in the tiers [ADR 0032](0032-the-loaders-layers-come-in-three-tiers.md) sets out, and the Layer the app's Actors Require in the browser, with its Document, in `src/app`, as `Start.app(app, { document, layer })`. Written beside what Requires it, each Layer is checked against it: a Capability left out is a type error where it is left out. Written in files of their own, found by name, each was handed to Start as any Layer, and a missing Capability failed only when a page was drawn.

Each server tier is a function of the env, since a binding exists only once a request has handed it. The app keeps its Document because both sides draw it, the server for the HTML and the browser to hydrate it, and `src/app` is the one file both import. Each file exports its bare value too, `app` and `loaders`, for a test or a story to run with Layers of its own.

## Considered Options

- **A file per Layer and one for the Document, found by name** (`layer.server`, `layer.client`, `document`): rejected. Nothing checks a Layer against what Requires it, and an app learns five names where three do.
- **The Layers as options of `start()` in the Vite config**: rejected. The config runs in Node at build time, apart from the code that Requires them, so it checks nothing either, and the server's Layer needs the env of a request.
- **`Router.app` and `Routes.loaders` taking the Layers**: rejected. Routing knows nothing of Start, a Document or a Worker's env, and stays that way.
- **The browser's Layer loaded lazily, so the Worker never bundles it**: rejected. Hydrating would wait on one more request. A Layer is a value, built only by a Runtime, so the server imports it and never builds it.

## Consequences

- The Worker bundles the browser's Layer and what it imports; a module that touches the browser when it is imported must be imported lazily inside it.
- Start reads only `Start.app(…)` and `Start.layers()…loaders(…)`: a bare `Router.app(…)` or `Routes.loaders({ … })` fails when the server starts, since nothing would check it.
