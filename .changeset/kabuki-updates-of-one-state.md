---
'@kestack/kabuki': patch
---

`UpdatesOf`, `WorkersOf` and `SelfOf` take a State as `DataOf` does: `UpdatesOf<typeof ConnectShape, 'SignedIn'>` types the `on` of that State's block in `build`, and a Worker in it reads its data narrowed to that State.
