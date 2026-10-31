---
'code': patch
---

A session's turns far from the view are skipped by the browser once laid out, so the sidebar sliding beside it, a resize or anything else that restyles the page touches only the turns in sight. A turn above the view laid out again at a new width keeps the view where it was. `pnpm bench` times the sidebar shut and opened beside a long session, and checks that scrolling up moves nothing.
