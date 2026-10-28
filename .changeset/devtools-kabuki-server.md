---
'@kestack/devtools': patch
'@kestack/devtools-kabuki': patch
---

DevTools keeps every running Kabuki app that dials it as a Kabuki Session, and an agent can ask one about itself: `devtools kabuki sessions`, `history`, `changes` and `snapshot`. `@kestack/devtools-kabuki/server` holds the routes (`kabukiRoutes`): `/kabuki/connect` for apps, from any origin, and `/kabuki/sessions` and `/kabuki/session/:name` for DevTools' own page and CLI only, with `dialSessions` and `dialSession` as their clients. A Kabuki Session Api `ValueChange` now leaves out `from` or `to` on the side a path was not there. The DevTools Server stops at once rather than waiting for open sockets to drain.
