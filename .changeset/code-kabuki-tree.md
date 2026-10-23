---
'code': patch
---

The app is laid out as a Kabuki Actor tree (`docs/kabuki-tree.md`), and each part reads only what it shows, so a change draws only that part: choosing a microphone, a turn running, or a Machine's line changing no longer draws the whole frame again. The sidebar has a Machine Filter at its top, every Machine or one, kept in this browser, and only the Machines it shows are synced there; beside it, Reload asks the Machines Backend for the list again. The list is no longer asked every 15 seconds: it is asked once, on Reload, and, while a Machine's line is not up, again every 3 seconds for the first minute and then every 30, until every line is up. The Background Jobs bubble is gone.

`src/` is regrouped: the root page in `src/shell/`, with the Actors on every page in `actors/` and the pages in `pages/`; what the app Layer gives in `src/layer/`; the server in `src/deploy/`. The Machine page is folded into the project page, at the same address, `/m/:machineId/p/:projectId`.
