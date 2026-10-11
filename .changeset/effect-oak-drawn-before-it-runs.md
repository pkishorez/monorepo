---
'effect-oak': patch
---

An app is drawn before it runs. `toReact` draws the init Snapshot on the first render, or a saved Log at its Head through Suspense, so a server or a static build renders the app and the client hydrates it; `useRuntime` reads the saved Log from the start. `toReact` takes `{ saved, name }`: a saved `RuntimeState` the Runtime carries on from as it says, live, stopped or showing an entry, and the app's name. When the last mount closes, the Log is left under that name on `globalThis`, and the next mount of an app with that name, after a hot reload too, Replays it through the new code. A Restore is a Message to the root that replaces the whole Snapshot with a saved one, checked against the Actors and ignored with a warning if it no longer matches; `Replay.restored` makes a Log of one Restore, and `Replay.fold` plays a Branch with no yielding. A Source can be `restore`.
