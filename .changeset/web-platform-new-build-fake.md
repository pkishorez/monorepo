---
'@kestack/web-platform': patch
---

`@kestack/web-platform/pwa/fake` gains `newBuild`, the New build fake: the builds a deploy puts out, as a page's PWA sees them, as a Fake the Fake World runs. Its Controls put a newer build out or take it back, and choose whether moving to it reloads the page; `serve` gives std-toolkit's `OnOutdated`, asked once per page load, waiting for a newer build, then reloading into it, with no service worker. `@kestack/std-toolkit` is a new optional peer.
