---
'@kestack/kabuki': patch
'@kestack/web-platform': patch
---

The service worker now answers every page with the App Shell, without the network, so an installed app opens at once at any URL. It keeps only the build's assets and the App Shell; each page loads its data through the Loader RPC, so server data needs a connection, and a Render Mode only says what the server sends when no worker answers. `navigation.networkTimeoutMs` is gone, and a navigation to a path with a file extension or under `/_kabuki/` goes to the network.

In Kabuki, the root page's Render Mode is now inherited like any other. Under a `client` root the server answers every URL with the App Shell and a `200`, except a file that is not there, which stays a `404`. `Start.app({ loading })` is what the App Shell paints until the app is drawn, and the App Shell now carries the root's Metadata.
