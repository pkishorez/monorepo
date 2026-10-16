---
'@kestack/kabuki': patch
---

A page says how long a copy of its data stays fresh: `Page.define({ staleTime })`, in milliseconds, inherited by the pages under it, and `Router.define(App, { staleTime })` for every dynamic or client page that says none, 0 unless said. A move or a Preload to a page with a fresh copy in the Data cache shows it and loads nothing; an older copy is shown `refreshing` and loaded again behind it, and a Preload loads it again. A static page's data is fresh until the next deploy, so `staleTime` on it is refused. A Reload loads every page on screen whatever its Stale time. `router.every` lists each place's Stale time. A preload of the move the Router holds asks nothing.
