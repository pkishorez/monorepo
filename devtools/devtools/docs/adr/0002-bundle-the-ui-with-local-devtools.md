# Bundle the UI with local DevTools

DevTools ships Lotel and Laymos as a self-contained browser application served
from the same loopback server as its RPC and OTLP endpoints. The bundled UI is
the canonical interface and replaces the hosted `kishore.app` client so the UI,
CLI, and contracts stay version-matched, work offline, and need no cross-origin
connection handoff.

## Consequences

- The DevTools package contains every browser asset, including fonts and icons.
- Browser assets are emitted as ordinary hashed files under `dist/ui`, beside
  the server executable, rather than encoded into it.
- The UI source and browser build live inside `@pkishorez/devtools`; there is no
  separately versioned UI package.
- Lotel- and Laymos-specific screens and components are owned by DevTools.
  Generic visual primitives may remain a build-time dependency and are compiled
  into the published browser assets.
- The hosted Lotel and Laymos routes are retired after migration.
- Lotel and Laymos use the local DevTools origin rather than selecting a remote
  server.
- The DevTools URL opens a local home page that presents Lotel and Laymos and
  links to their `/lotel` and `/laymos` routes.
- Direct visits to `/lotel` and `/laymos` load the same browser application.
- The UI is a client-only React application built with Vite and TanStack Router;
  it does not carry the hosted application's SSR or Cloudflare runtime.
- Generated links use `http://127.0.0.1:<port>` as the canonical local origin.
- `/health` provides the machine-readable server metadata previously returned
  from `/`.
- The local application has its own focused shell and does not include
  `kishore.app` navigation, analytics, authentication, or unrelated routes.
- Starting DevTools prints its local URL; opening a browser remains opt-in
  through `--open`.
- Browser preferences and the Laymos project list remain local to the canonical
  browser origin; telemetry continues to use Lotel's SQLite store.
- The application does not install a service worker. Its HTML is not cached,
  while content-hashed assets are immutable, preventing an old UI from outliving
  its matching RPC server.
- Starting the server fails with a clear packaging error when its UI artifact is
  missing; independent CLI subcommands remain usable.
- UI history fallback applies only to browser routes. RPC, OTLP, health, and
  static-asset namespaces return real HTTP errors for unknown paths.
