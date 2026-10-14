---
'@kestack/kabuki': patch
---

A page an outlet serves can name a `pending` and a `failed` screen. A move still loading after 150ms lands early, so the slot of the place it waits on shows its pending screen, kept for at least 300ms; `Router.app` takes `pending: { delay, minimum }` to change both. A move whose Loaders break no longer does nothing: it lands, marked failed, and the slot shows the page's failed screen, or the one given to `Router.app` as `failed`. `useRouter().failed` says why, and a link to the same Route tries again. An outlet's function now gets each screen as its own page, with `showing` saying which.
