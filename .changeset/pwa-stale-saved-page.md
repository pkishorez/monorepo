---
'@kestack/web-platform': patch
---

The service worker no longer saves a page an older deploy drew. On install, each page must carry the server build that Kabuki Start's Pages name; a stale copy, as iOS Safari can answer even a `reload` fetch with, is asked for once more past every cache, then left to the network, or fails install if it is the App Shell. Before, a stale home page was saved and loaded unstyled for the whole life of the build, since the files it pointed at were gone.
