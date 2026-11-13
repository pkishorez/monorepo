---
'@kestack/kabuki': patch
---

A `Router.Link` and a `Router.Retry` are no longer drawn again on every move: they read the Router's Sends alone, which never change. `useRouter` draws again only when what it holds changes: the entries, the move, the move held or the Metadata.
