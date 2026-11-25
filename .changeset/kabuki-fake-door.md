---
'@kestack/kabuki': patch
---

`@kestack/kabuki/fake` fakes the services an app uses, in a browser, in plain Effect. `Fake.make` says what one Fake is: its state as a Schema and where it starts, its controls, each made with `Fake.control` from the state's Schema, its payload's Schema and what it does, and its Layer over the state as a `SubscriptionRef`. `FakeWorld.make` puts an app's Fakes together: `layer` serves them all, starting each from `initial` or from `start` in its Scope; `fakes` streams every Fake as it is now; `control` runs a control by name with an unknown payload, decoded by its Schema, and says `'done'` or why not. It keeps nothing, runs no Actor, and knows nothing of DevTools or RPC. Its types are at `@kestack/kabuki/fake/types`.
