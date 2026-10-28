---
'@kestack/devtools': patch
'@kestack/devtools-kabuki': patch
---

DevTools keeps every Kabuki app that connects as a Kabuki Session. `devtools kabuki sessions`, `history`, `changes` and `snapshot` read them. `@kestack/devtools-kabuki/server` holds the routes.
