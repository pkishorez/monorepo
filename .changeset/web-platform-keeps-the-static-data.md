---
'@kestack/web-platform': patch
---

The service worker keeps the Static Data: what Kabuki Start's build kept of each static place, the same for everyone. Every Preset has a `data` rule, cache-first, for `/_kabuki/data/`, and the app starts its static places from it in the App Shell, so a static page opens whole, and offline once it has been seen. A dynamic or client page's data is still never kept.
