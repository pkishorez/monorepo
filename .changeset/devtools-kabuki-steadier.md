---
'@kestack/devtools': patch
'@kestack/devtools-kabuki': patch
'code': patch
---

Kabuki in DevTools, steadier. While the DevTools Server goes down, the `/kabuki` page keeps the whole list it had, marked reconnecting, rather than losing some Kabuki Sessions first. A Kabuki Session's page is followed as its app moves, in the list and in `devtools kabuki sessions`, through a new `page` stream in the Kabuki Session Api. The Inspector says it is waiting for the app until the Kabuki Session first answers. The empty page's `connect` snippet names the DevTools Server the page came from. The CLI says `The Kabuki Session <name> disconnected.` when one goes during a call. DevTools opened at `http://localhost:<port>` works as at `127.0.0.1`: its page's own origin is trusted at either loopback host, and every other origin is still refused. The code app is called `code` in DevTools.
