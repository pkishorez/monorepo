---
'@kestack/kabuki': patch
---

Kabuki Start serves two things for whatever stands in front of an app, such as a service worker, and knows nothing of what uses them. `GET /_kabuki/pages` (`Start.pages`) lists every Page with its path, whether its path has params, and how its first drawing is made, `static`, `dynamic` or `client`, worked out from the Render Modes on its path. `GET /_kabuki/shell` is the App Shell: the Document with no app drawn in it, cached once per build, which the browser fills at its own URL with every place loading. `Start.Head` takes a `viewport`.
