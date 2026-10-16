---
'@kestack/kabuki': patch
---

`Page.redirect` takes `{ permanent: true }`, which a server answers with a `308` rather than a `302`, and a whole URL outside the app, `Page.redirect('https://…')`, which a server answers with a `302` to it and the browser leaves for in place of the entry. A Loader's Redirect is typed to a Route of its own router. An Adapter's `leave` takes `{ replace }`. A redirect's URL the browser hears while its Route is already on screen is now replaced in the address. A query no page reads, like `?utm_source=`, is left in the address as it is; each move the app makes writes its Route alone.
