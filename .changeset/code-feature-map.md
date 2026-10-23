---
'code': patch
---

`src/` is a feature map, with nothing changed in what the app does. Pages nest as they do in the URL, `shell/` → `project/` → `session/`, each an `actor.ts` and a `view.tsx`; every other feature sits in the page that draws it, with the server calls it makes in an `api.ts` beside its actor, and the shared `ai/commands.ts` is gone. `replica/` holds the Queries and `places/` every place's address: Views link through it, and only the root page imports the router. The Start app is `src/app`, and the Laymos Rules shrink to what the tree needs.
