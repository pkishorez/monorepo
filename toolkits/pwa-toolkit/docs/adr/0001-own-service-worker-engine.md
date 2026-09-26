# Own service worker engine instead of Workbox, Serwist, or vite-plugin-pwa

The toolkit builds its own service worker: a Vite plugin emits the Precache list from the client bundle and builds the worker as its own environment, and the worker runtime (Precache, Runtime Cache strategies, navigation handling, lifecycle) is written in Effect.

## Considered Options

- **vite-plugin-pwa** — assumes an `index.html` and wraps workbox-build; it fights an SSR TanStack Start app on Vite 8 with rolldown.
- **Serwist** — mature strategies, but not Effect, and its lifecycle model would have to be wrapped rather than owned.

## Consequences

The core we own is small: a Precache list, a handful of caching strategies, and a lifecycle state machine. Owning the worker entry is also what lets Worker RPC and Coordinated Reload exist without working around someone else's worker.
