---
'@kestack/devtools-kabuki': patch
'@kestack/devtools': patch
---

A Kabuki Session runs in an Environment: the one `connect({ environment })`
is given, else the page's host, else `default`. DevTools lists Kabuki
Sessions by app, then Environment, with the one picked shown as
app › Environment › name over the Inspector. `devtools kabuki sessions`
prints the same tree, as `{ apps: [{ app, environments: [{ environment,
sessions }] }] }` in JSON, and takes `--app` and `--env`.
