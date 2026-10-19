---
'@kestack/kabuki': patch
---

The Router takes `minimum`, how long a page's loading screen stays at least once drawn (300 ms unless said), beside `delay`. A Ready `status` now says `waited`: true when its data took the place of a loading screen the page drew, so a View can fade such data in then alone. `Router.reload({ anew: true })`, for when what the data belongs to changed, as the signed-in account, never shows the old data behind the load: the Router holds it as a move, up to `delay`, then each page shows it is loading, and every copy in the Data cache goes. Breaking: `Navigation.reload` is now a function, `reload(options?)`.
