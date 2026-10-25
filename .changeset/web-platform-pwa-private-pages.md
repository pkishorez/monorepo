---
'@kestack/web-platform': patch
---

The PWA no longer saves a page the server marks `private` or `no-store`, so one Account's page is never shown to the next on the same device. A static page with a query is now its own page, fetched and saved the first time it is visited, instead of the precached page without the query.
