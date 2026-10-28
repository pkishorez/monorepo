---
'@kestack/web-platform': patch
'@kestack/devtools-kabuki': patch
---

The Kabuki Inspector moved out of `@kestack/web-platform/recipes/devtools` into `@kestack/devtools-kabuki/inspector`, rebuilt as Kabuki Actors that read and move the app only through the Kabuki Session Api. `KabukiDevtools` is gone from web-platform; use `KabukiInspector` from `@kestack/devtools-kabuki/inspector` with the same `runtime`, `defaultTravel`, `presenting`, `dotted`, `timelineAt`, `overlay` and `className`, and import `@kestack/devtools-kabuki/inspector/sources.css` beside the Theme so Tailwind generates its classes. It no longer plays a `story`; the `Story` type stays, exported from the new door. `recipes/devtools` keeps `DevtoolsDock`. The Inspector Actor, its View and its one Capability, `KabukiSession`, are exported too, for an app that places it as a Child and Provides a Kabuki Session of its own.
