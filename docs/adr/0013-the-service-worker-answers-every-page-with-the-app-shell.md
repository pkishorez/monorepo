# The service worker answers every page with the App Shell

A page's offline behaviour used to follow from its Render Mode: a client page was the App Shell, a static page a saved copy, and a dynamic page or one Start did not name the network within a timeout. That made launches wait: an installed `code` opens at `/`, which names no page, so every launch went to the network for up to three seconds with the App Shell sitting in the cache.

So the worker keeps the build's assets and the App Shell, and answers every page navigation with the App Shell, without the network. The app starts in it at the page's URL, and each page that needs data asks the Loader RPC, as a move in the app already does. A Render Mode now only says what the server sends when no worker answers: a first visit, a crawler, a shared link. The worker no longer reads a page's Render Mode, and keeps no copy of any other page.

The App Shell paints what `Start.app({ loading })` says until the app is drawn, so it is not blank before the script runs. A root page's Render Mode is inherited like any other, and under a `client` root the server answers every URL with the App Shell and a `200`, so an app such as `code` has one document, not one per URL. Only a path with a file extension that names no page stays a `404`.

## Consequences

- The app always opens; server data needs a connection. A page with no data, whose content is in the code, still works offline.
- Every page stays on the active Build ID while a newer version waits, with no rule for it: the App Shell is always this build's. This replaces the pinning of [web-platform ADR 0006](../../platforms/web-platform/docs/adr/0006-pending-update-pins-navigations-to-the-active-build.md).
- A static page opened through the worker shows its loading state first, and its Loader runs on the server each time, because the Loader RPC is a `POST` no CDN keeps. A move in the app already works this way. What separates static from dynamic pages, and whether static data should be cacheable, is left open.
- A navigation to a path with a file extension or under `/_kabuki/`, or one under `neverCache` or `navigation.denylist`, goes to the network. An app with other server-only URLs must list them in `navigation.denylist`.
- `navigation.networkTimeoutMs` is gone: no page waits on the network.

## Considered Options

- **Serving `/` alone from the App Shell**: rejected; every other URL would still wait on the network, or need a saved copy per URL and deploy.
- **Showing a saved copy of a dynamic page, then refreshing it**: rejected; it keeps one account's HTML on the device, where an Account Switch can show it.
- **Pre-rendering static pages into the worker**: left for later; pages with params need a list of their URLs no app has today, and a Loader may need bindings a build does not have.
