# Kabuki Start serves; the Web Platform decides

Kabuki Start knows nothing of a look, a PWA, a service worker or a deploy: it serves an app from its two entries, `app` and `loaders`, and offers seams to build on, such as each page's Render Mode at build time and the App Shell. The Web Platform is where every kestack app's choices are made, in four modules (`ui`, `pwa`, `recipes`, `app`), and every app is a PWA unless it turns that off. The PWA works out how each page behaves offline from its Render Mode alone (static pages precached, dynamic ones network-first with the last copy, client ones answered by the App Shell) rather than from settings of its own, so a page's offline behaviour cannot disagree with how it is served.

## Considered Options

- A PWA inside Kabuki Start, since every app is one: rejected, because Kabuki Start must stay usable with any UI and any deploy.
- The PWA configured beside the routes (`shellPath`, `cachePages`): rejected, because the two drift apart; a per-route override remains for the exceptions.
