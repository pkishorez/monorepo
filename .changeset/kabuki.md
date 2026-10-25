---
'@kestack/kabuki': patch
---

- Kabuki Start serves `/_kabuki/pages` and `/_kabuki/shell` for whatever stands in front of the app, and runs anywhere Nitro does.
- Breaking: `Start.app({ router, view, document, layer })` and `Start.server(...)` each take one object.
- Queries ask a live Instance a question; `running.instance()` reaches a running app from outside.
- Breaking: `Navigation.reload` is a function, `reload({ anew, hold })`.
- An Actor's type is slim, so deep apps emit declarations; doors export only what is used.
