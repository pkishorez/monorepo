---
'@kestack/web-platform': patch
'@kestack/devtools-kabuki': patch
---

The Kabuki Inspector moved to `@kestack/devtools-kabuki/inspector` as `KabukiInspector`, rebuilt on a canvas over a Timeline, with Time Travel and Fork. It reads the app only through the Kabuki Session Api.

Breaking: `KabukiDevtools` and `Inspector` are gone from web-platform, and `story` is no longer played. Import `@kestack/devtools-kabuki/inspector/sources.css` beside the Theme. `recipes/devtools` keeps `DevtoolsDock`.
