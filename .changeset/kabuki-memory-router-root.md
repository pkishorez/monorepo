---
'@kestack/kabuki': patch
---

A Router that routes in memory starts at its root, not at whatever page the browser is on, so a routed demo can sit inside another app's page. `Router.view` no longer gives `View.app` an `input` that reads the browser's address: only an app whose Layer holds an Adapter owns the address, and it starts there with `input: () => view.startAt()`. Start's client does this for you; an app that gives `browser()` or `tanstack()` to `View.app` itself adds that line.
