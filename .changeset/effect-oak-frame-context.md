---
'effect-oak': patch
---

Views read the Frame from context. `toReact` provides the app's one `frame` through React context, and a View's props are only `{ node }`: parents no longer pass `frame={frame}` to their Children's Views. Draw functions still get `frame`. Outside a running app it stands still at 0.
