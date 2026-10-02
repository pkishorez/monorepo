# @kstackz/pwa-toolkit

Effect-native service worker, precache, update and install utilities that turn a TanStack Start app into a PWA

## Big picture

A TanStack Start app renders on the server, so the usual PWA plugins, which expect an `index.html`, have nothing to hold on to. pwa-toolkit owns the whole path instead. Its core is five ideas: every deploy is a **Build** with a Build ID; the build ships a **Worker** that answers each request by a **Strategy**; each open page watches one **Status**; and a waiting **Update** is applied only when the user accepts, reloading every open page together. `@kstackz/pwa-toolkit/vite` makes the Build, `@kstackz/pwa-toolkit/worker` runs the Worker, and `@kstackz/pwa-toolkit/client` (with `react` on top) gives the page its Status. Everything else is optional: `@kstackz/pwa-toolkit/extras` (Install Prompt, online state, display mode, storage) needs no provider, and Worker RPC (`@kstackz/pwa-toolkit/rpc/*`) is a separate capability. [`apps/pwa-playground`](../../apps/pwa-playground) dogfoods every part, one route per scenario. The words are defined in [CONTEXT.md](CONTEXT.md); the decisions behind the shape are in [docs/adr/](docs/adr/).

The plugin leans on Start's prerender, and Start keeps its options to itself, so the app sets them. `pwa()` goes after `tanstackStart()` in the Vite plugins, because the worker builds in a post `buildApp` hook that must run after prerendering; the wrong order throws at config time. `tanstackStart()` needs `spa: { enabled: true, prerender: { outputPath: '/_shell' } }` for the App Shell, a `pages` entry for `/offline` with `prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false }` for the Offline Fallback, and `prerender: { autoStaticPathsDiscovery: false }`. When either page is missing from the build, the build warns and prints the exact options.

Two builds matter outside the happy path. In `vite dev` the worker is off unless `pwa({ dev: true })`, and a page with it off removes any worker a previous session left behind. `pwa({ enabled: false })` builds the Kill Switch: a plain worker that deletes the toolkit's caches, unregisters itself and reloads its pages.

Pick a `preset` by app kind, from the playground's lifecycle runs. `app` (the default) suits signed-in dashboards and tools: the App Shell renders any route offline, visited or not. Add Strategy rules for the data you need offline; data fetched only during the server render never reaches the browser's cache, so fetch offline-critical data in the browser (or warm it) under a network-first rule. `content` suits docs and content sites: visited pages come back offline with their server-rendered content, unvisited ones get the Offline Fallback, and saved pages belong to their Build ID, so an update drops them rather than keep pages whose assets are gone. Offline-first tools that edit data offline need `app` plus std-toolkit's sync, which is outside this toolkit. While an update waits, the App Shell of the active build answers navigations, so reloads and new pages stay on the active Build ID until the user accepts ([ADR 0005](docs/adr/0005-pending-update-pins-navigations-to-the-active-build.md)).

## Install

```sh
pnpm add @kstackz/pwa-toolkit effect
```

- `effect` (peer, required): every subpath is built on it, and Worker RPC on `effect/rpc`.
- `vite` (peer, optional): needed by `@kstackz/pwa-toolkit/vite`.
- `react`, `react-dom` (peers, optional): needed by `@kstackz/pwa-toolkit/react` and `@kstackz/pwa-toolkit/extras`.
- `@kstackz/ui-toolkit` (peer, optional): the components `@kstackz/pwa-toolkit/react` (`UpdatePrompt`) and `@kstackz/pwa-toolkit/extras` render with.

## Exports

### `@kstackz/pwa-toolkit/vite`

| Export | What it does                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa`  | Vite plugins that emit the manifest, pick the Precache, compute the Build ID, build the worker (or the Kill Switch) and add `no-cache` rules to `_headers`. |

### `@kstackz/pwa-toolkit/worker`

| Export             | What it does                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `runServiceWorker` | Starts the worker; call it once at the top of the entry, optionally with a `layer` such as a Worker Server.       |
| `WorkerHost`       | Service given to that `layer`: the worker's Build ID and a stream of every `message` event that is not a command. |

### `@kstackz/pwa-toolkit/client`

| Export              | What it does                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Pwa`               | Service with the page's `status`, `checkForUpdate`, `applyUpdate` (reloads every open page) and `clearRuntimeCache`. |
| `Pwa.layer`         | Registers the worker and builds `Pwa` from the build info; browser only, never during SSR.                           |
| `PwaStatus`         | Tagged enum `Unsupported`, `Installing`, `Ready`, `UpdateReady`, `Updating`.                                         |
| `clearRuntimeCache` | Effect that deletes every Runtime Cache, with no registration or `Pwa` needed.                                       |

### `@kstackz/pwa-toolkit/react`

| Export              | What it does                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PwaProvider`       | Registers the worker after mount and gives `usePwa` its status; render it in the root.                          |
| `pwaHead`           | Head tags for the root route: manifest link, Apple icon, and meta tags for the Build ID, build time and commit. |
| `usePwa`            | The status with `checkForUpdate` and `applyUpdate` (`Unsupported` before mount), and the page's `version`.      |
| `clearRuntimeCache` | Deletes every Runtime Cache; works outside `PwaProvider`, for example in sign-out.                              |
| `UpdatePrompt`      | Persistent toast while an update is ready; accepting it reloads every page into it.                             |

### `@kstackz/pwa-toolkit/extras`

| Export                  | What it does                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useInstall`            | Install state with `prompt` and `dismiss` (remembered 30 days); call it in the root to catch the browser's offer. |
| `InstallPrompt`         | Bottom sheet on small screens, corner card on larger ones, manual steps on iOS Safari.                            |
| `Install`               | The Effect service behind `useInstall`, with its `layer`.                                                         |
| `InstallState`          | Tagged enum `Unsupported`, `Available`, `ManualIos`, `Installed`, `Dismissed`.                                    |
| `useOnline`             | Whether the browser is online; `true` before mount.                                                               |
| `OfflineIndicator`      | "You're offline" pill in a live region, stacked above sheets.                                                     |
| `Online`                | The Effect service behind `useOnline`, with its `layer`.                                                          |
| `useDisplayMode`        | The display mode, such as `browser` or `standalone`; `browser` before mount.                                      |
| `DisplayMode`           | The Effect service behind `useDisplayMode`, with its `layer`.                                                     |
| `useStoragePersistence` | Persisted flag with `persist` and `estimate`; `null` while unknown.                                               |
| `StoragePersistence`    | The Effect service behind `useStoragePersistence`, with its `layer`.                                              |

### `@kstackz/pwa-toolkit/rpc/worker`

| Export               | What it does                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `WorkerServer.layer` | Serves an Effect `RpcGroup` inside the worker; provide its handlers and pass it to `runServiceWorker`. |

### `@kstackz/pwa-toolkit/rpc/client`

| Export               | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `WorkerClient.make`  | Scoped Effect that opens this page's RPC client to the Worker Server.                     |
| `WorkerClient.layer` | The same client as a Layer under your own service tag.                                    |
| `VersionSkew`        | Tagged error a call fails with when the worker belongs to another Build ID than the page. |

## Usage

### Turn a TanStack Start app into a PWA

Four pieces: the plugins in `vite.config.ts`, the head tags and provider in the root route, the Tailwind source, and an `/offline` route. Trimmed from [`apps/pwa-playground`](../../apps/pwa-playground).

```tsx
// vite.config.ts
plugins: [
  tailwindcss(),
  tanstackStart({
    spa: { enabled: true, prerender: { outputPath: '/_shell' } },
    pages: [{ path: '/offline', prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false } }],
    prerender: { autoStaticPathsDiscovery: false },
  }),
  react(),
  pwa({ manifest: { name: 'PWA Playground', short_name: 'PWA Lab', ...manifestTheme, icons }, strategies }),
],

// src/routes/__root.tsx
head: () => {
  const pwa = pwaHead();
  return { meta: [{ charSet: 'utf-8' }, ...pwa.meta], links: [{ rel: 'stylesheet', href: appCss }, ...pwa.links] };
},

function RootComponent() {
  useInstall(); // extras: listen for the browser's install offer from the start
  return (
    <PwaProvider>
      <Outlet />
      <OfflineIndicator />
      <UpdatePrompt />
    </PwaProvider>
  );
}

/* src/styles.css */
@source '../node_modules/@kstackz/pwa-toolkit/dist';

// src/routes/offline.tsx: the worker redirects here as /offline?from=<page>
export const Route = createFileRoute('/offline')({ component: Offline });
```

- Tailwind v4 does not scan `node_modules`, so without the `@source` line the `react` and `extras` components (built on [`@kstackz/ui-toolkit`](../ui-toolkit)) render unstyled.
- The build writes `sw.js`, `manifest.webmanifest`, `_shell.html`, `offline.html` and a `_headers` block with `Cache-Control: no-cache` for the worker and the manifest.
- A navigation tries the network for `navigation.networkTimeoutMs` (3 s), then a saved page (with `cachePages`), then the App Shell (with `shell`), then redirects to the Offline Fallback. The `/offline` route should only send "Try again" back to a same-origin `from`.
- Paths under `neverCache` (default `/api/auth/`), non-GET requests and `navigation.denylist` never reach the worker's caches. `strategies` rules match first-wins, yours before the preset's.
- `usePwa().version` is `{ buildId, builtAt, commit }` for the build that rendered this page, read from its meta tags. `builtAt` is an ISO string from when the build ran; `commit` is `git rev-parse --short HEAD`, with `-dirty` for uncommitted changes. Either is `null` when unknown: git is missing, the build is not a checkout, or git fails. Set `version: { commit, builtAt }` in `pwa({...})` to supply them yourself, for example from CI. Neither feeds the Build ID, so rebuilding the same code is still no update.
- The status comes from the browser's own service worker events; the page never asks the worker. `UpdatePrompt` never reloads unasked. To apply a ready update on the next route change instead, call `usePwa().applyUpdate` from `router.subscribe('onResolved', …)`, as the playground's root does.

### Call the service worker with Worker RPC

The worker entry `src/sw.ts` serves an Effect `RpcGroup`; each page calls it with a Worker Client. From the playground's `src/sw.ts` and `/rpc` page.

```ts
// src/sw.ts
const handlers = PlaygroundRpcs.toLayer(
  Effect.gen(function* () {
    const host = yield* WorkerHost;
    return {
      Echo: ({ text }) =>
        Effect.succeed({ text, at: new Date().toISOString() }),
      Ticks: ({ count }) =>
        Stream.fromSchedule(Schedule.spaced('1 second')).pipe(
          Stream.take(count),
          Stream.map((n) => n + 1),
        ),
      WorkerInfo: () => Effect.succeed({ buildId: host.buildId, startedAt }),
    };
  }),
);

runServiceWorker({
  layer: WorkerServer.layer(PlaygroundRpcs).pipe(Layer.provide(handlers)),
});

// in the page
const client = yield * WorkerClient.make(PlaygroundRpcs); // scoped
const reply = yield * client.Echo({ text: 'hello' });
const ticks = client
  .Ticks({ count: 20 })
  .pipe(Stream.retry(Schedule.spaced('1 second')));
```

- Each message goes through `navigator.serviceWorker.controller`, which wakes a stopped worker. On a first visit a call waits for the worker to take control; `make` fails at once when no worker ever will (the PWA is off in this build, or a hard reload left the page uncontrolled).
- The browser stops idle workers. The next call after an idle stop succeeds; calls in flight fail with `RpcClientError` and the Worker Client reconnects by itself.
- Streams restart from the handler's start (Subscription Restart), so the Worker Server keeps no state and each subscription emits everything a fresh subscriber needs.
- A page of another Build ID gets `VersionSkew` on every call; answer it with `usePwa().checkForUpdate()`.

### Clear cached data on sign-out

Runtime Caches outlive a session, so the next person on the device would see the last one's data. Call `clearRuntimeCache()` after the sign-out request. From the playground's `/auth-sim` page.

```ts
import { clearRuntimeCache } from '@kstackz/pwa-toolkit/react';

const signOut = async () => {
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sign-out' }),
  });
  await clearRuntimeCache();
};
```

- It deletes every `pwa-toolkit:runtime:*` cache and leaves the Precache alone, so the app still opens offline.
- It needs no `PwaProvider`; outside React, run the `clearRuntimeCache` Effect from `@kstackz/pwa-toolkit/client`.
- `/api/auth/` is in `neverCache` by default, so session reads always hit the network and fail offline. Treat a failed read as "unknown", not as signed out.
