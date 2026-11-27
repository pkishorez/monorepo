---
'@kestack/devtools-kabuki': patch
'@kestack/devtools': patch
---

A Kabuki Session answers a ninth call, `blueprint`: the root's Blueprint as plain data, one `Plan` per place an Actor can be in, with nothing running. Each Plan has its path (`App/Inside:downloads/files`, an Instance's Address without its keys and counts), its Actor and description, the Shapes of its Input, Model and Props, its States with their data's Shape, the Messages it takes with their descriptions and payloads' Shapes, its Workers, Queries and what it Provides, each at the top or in the State it is written in, its Emits, its Requires, and its Children by slot. An Actor that is its own Child below is not grown again: its Plan says which path it repeats. The page answers it straight against the app, and DevTools passes it to the tab like the other eight.
