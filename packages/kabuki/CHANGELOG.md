# @kestack/kabuki

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - First release. An app as one tree of Actors outside React: each Actor a small state machine driven by Messages, one immutable Snapshot for the whole app, Effect running the work, and React only drawing it.

  - `Actor.make` declares an Actor's Schemas (`input`, `props`, `model`, `message`, `state`) and what it `requires`; `build` gives its behavior at the top and per State: `on` (the Updates), `children`, `invoke`, `provides` and `workers`. `Actor.many` declares keyed Children.
  - `Command.make(name, { args, run })` makes a Command once; an Update asks for it as plain data a test can compare.
  - `History` records every Message as a tree of Branches and replays to any entry. `Runtime.start(history, layer)` runs it. A History saves as plain JSON through the Actors' Schemas, so the encoded side of every Schema must be JSON-safe.
  - `@kestack/kabuki/react`: `toReact` draws the app and hydrates from a saved History, `View.make` draws one Actor, `useChild` and `useChildren` let a parent View read its Children, and `useRuntime()` reports a Runtime that failed to start or move as `failure`.
