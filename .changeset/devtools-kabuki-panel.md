---
'@kestack/devtools-kabuki': patch
---

The Inspector, rebuilt on the eight calls: it reads and moves the app only through `KabukiSession`, so it is the same panel in the page and in DevTools.

**Added**

- `KabukiInspector({ runtime, world?, presenting?, timelineAt?, overlay?, dotted?, className? })` in `./app`: the Inspector beside a running app in the same page, its Kabuki Session answered in the page.
- `KabukiDevtools({ runtime, world?, storageKey, onPhones?, children })` in `./app`: the app wrapped in the Web Platform's Dock, the Inspector loaded the first time it opens, frosted over the app when full screen.
- `Inspector` and `InspectorView` in `./devtools`: the root Actor and its View, to place as a Child with a `KabukiSession` Provided, as from `remote`.
- The World tab, while the app has Fakes: each Fake's controls beside its state now, which follows `fakes`. A control with nothing to fill in is one Run button; the others open a form built from its payload's Shape. Each is run with `control` and says done, or the reason it was refused, beside it.
- `form` on `KabukiDevtools`: `'dock'` by default, or `'dialog'`, which leaves the app untouched and opens the Inspector full screen over it from the Web Platform's `DevtoolsDialog` beside it.
- `world`, on `connect`, `KabukiInspector` and `KabukiDevtools`, may be a function that loads the FakeWorld, so an app imports its fakes only when it runs them.
- Actions on an open card: every Message its Instance's Actor takes in the State it is in, each a form built from its payload's Shape, Sent with `send` and showing what came of it. While a past Step is shown, they offer only to go back to now.

**Changed**

- Breaking: picking a Step always Time Travels the app, and Now goes back to the Head. The Travel the app switch and `defaultTravel` are gone.
- Breaking: the Inspector's Input is `{ presenting, place }`.
- The Branches of the Timeline are worked out from the entries' parents that `watch` streams.

**Removed**

- Breaking: following one Instance's Trail, and Stories.
- What a Step changed inside a card (Model and Props diffs, Workers started and stopped, Children stopped): a card says only whether the Step started or changed its Instance.
