---
'@kestack/devtools-kabuki': patch
---

New package: a running Kabuki app connects to DevTools as a Kabuki Session. `@kestack/devtools-kabuki/api` is the Kabuki Session Api, an Effect RPC group for its History, Snapshots, changes, graph and cards, with travel and fork. `@kestack/devtools-kabuki/session` answers it from an app: `connect` dials the DevTools Server and serves the Api over that socket, redialing when DevTools restarts, and `inMemory` serves it to an in-page Inspector.
