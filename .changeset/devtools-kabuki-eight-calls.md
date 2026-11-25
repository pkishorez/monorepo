---
'@kestack/devtools-kabuki': patch
---

A Kabuki Session is eight calls behind one Service, `KabukiSession`: `blueprint`, `watch`, `look`, `travel`, `fork`, `send`, `fakes` and `control`. They are answered in the page, straight against the app and its FakeWorld, or through the DevTools Server, which passes each to the tab over one RPC group.

**Added**

- `send({ to, message })`: Sends an encoded Message to the Instance at an Address, decoded by its Actor's Schema, from `{ kind: 'outside', name: 'devtools' }`. It answers `handled`, `ignored`, `queued` or `refused`, or fails with `InstanceNotFound`, `MessageRefused` or `Seeking`.
- `fakes()` and `control({ fake, control, payload })`, over a FakeWorld from `@kestack/kabuki/fake` given to `connect({ world })`.
- `look({ at, open })`: the Instances at a Step, what that Step did to each, and the encoded data and Workers of the ones opened.
- A Shape of every Message payload, State's data, Model, Props, Fake state and control payload: text, number, boolean, choice, struct, array or JSON, each field with whether it is optional or nullable and its description.
- `remote(origin, name)`: the `KabukiSession` Layer of a live Kabuki Session through a DevTools Server.

**Changed**

- Breaking: two doors, `./app` (`connect`) and `./devtools` (`kabukiRoutes`, `remote`, `dialSessions`, `KabukiSession`, `grouped`, `isLocalEnvironment`, `KabukiSessionSummary`, `CONNECT_PATH` and the errors). `./api`, `./session`, `./server`, `./inspector` and `./fake` are gone; `./inspector/sources.css` stays.
- Breaking: `connect(options)` is only an Attachment; it no longer takes a Runtime first.
- `watch` streams where the app is, the page's URL included, and every entry kept on every Branch.
- `fork({ from })` takes a Step, `'start'` for the History's start; `seek` is `travel({ to })`.

**Removed**

- `info`, `named`, `history`, `page`, `snapshot`, `changes`, `graph`, `node` and `trail` as calls, `inMemory`, `dialSession`, and the fake bubble and Fake World of `./fake`, replaced by `@kestack/kabuki/fake`.
