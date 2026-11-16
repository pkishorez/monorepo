# The service worker keeps the Static Data

[ADR 0013](0013-the-service-worker-answers-every-page-with-the-app-shell.md) left two things open: a static page opened through the worker showed its loading state first and ran its Loader on the server each time, and nothing said what separates a static page from a dynamic one once a worker answers. Kabuki Start now draws every static page at the build and keeps each static place's answer beside it, the Static Data, one file per place and path under the build id ([Kabuki ADR 0049](../../packages/kabuki/docs/adr/0049-a-static-page-is-drawn-at-the-build-from-the-paths-it-lists.md)).

So the worker keeps what is the same for everyone and nothing else: the build's assets, the App Shell, and each Static Data file once it has been fetched, cache-first, since a file under a build id never changes. It still answers every page with the App Shell. The app reads the static places at its URL from the Static Data before its first frame, so a static page opens whole, as the build drew it, and offline once it has been seen. A dynamic or client page's data is a visitor's, and is never kept: it needs a connection, as before.

The rule is one Runtime Cache rule every Preset has, by the path alone, so the worker still carries none of Start.

## Considered Options

- **Keep each static page's HTML in the worker**: rejected, as in ADR 0013. One copy per URL and deploy, and a second way for a page to open; the App Shell and a place's data draw the same page.
- **Download every Static Data file as the worker installs**: left for later. A site may list thousands of paths, and an install downloads all of the Precache.

## Consequences

- A static page seen once opens offline; one never seen needs a connection for its data, and shows it is loading meanwhile.
- A sign-out clears the Runtime Caches, the Static Data among them. It is fetched again when next read.
- An app served under a Vite `base` other than `/` has its Static Data at another path, which the rule does not match: the worker then leaves it to the network.
