# pwa-toolkit

Effect-native service worker, precache, update and install utilities that turn a TanStack Start app into a PWA

## Big picture

A TanStack Start app renders on the server, so the usual PWA plugins, which expect an `index.html`, have nothing to hold on to. pwa-toolkit owns the whole path instead: a Vite plugin builds the service worker as its own environment and fills the Precache from the client bundle, the worker runtime (Precache, Runtime Cache, navigation, updates) is written in Effect, and the tab side is a set of Effect services with React hooks and ready-made UI on top. [`apps/pwa-playground`](../../apps/pwa-playground) dogfoods every part of it, one route per scenario. Vocabulary (App Shell, Offline Fallback, Build ID, Coordinated Reload, Kill Switch, Worker RPC) is in [CONTEXT.md](CONTEXT.md); the decisions behind the shape are in [docs/adr/](docs/adr/).

The plugin leans on Start's prerender, and Start keeps its options to itself, so the app sets them. `pwa()` goes after `tanstackStart()` in the Vite plugins, because the worker builds in a post `buildApp` hook that must run after prerendering; the wrong order throws at config time. `tanstackStart()` needs `spa: { enabled: true, prerender: { outputPath: '/_shell' } }` for the App Shell, a `pages` entry for `/offline` with `prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false }` for the Offline Fallback, and `prerender: { autoStaticPathsDiscovery: false }`. When either page is missing from the build, the build warns and prints the exact options.

Two builds matter outside the happy path. In `vite dev` the worker is off unless `pwa({ dev: true })`, and a disabled tab removes any worker a previous session left behind. `pwa({ enabled: false })` builds the Kill Switch: a plain worker that deletes the toolkit's caches, unregisters itself and reloads its tabs.

Pick a `preset` by app kind, from the playground's lifecycle runs. `app` (the default) suits signed-in dashboards and tools: the App Shell renders any route offline, visited or not. Add Runtime Cache rules for the data you need offline; data fetched only during the server render never reaches the tab's cache, so fetch offline-critical data in the browser (or warm it) under a network-first rule. `content` suits docs and content sites: visited pages come back offline with their server-rendered content, unvisited ones get the Offline Fallback, and saved pages belong to their Build ID, so an update drops them rather than keep pages whose assets are gone. Offline-first tools that edit data offline need `app` plus std-toolkit's sync, which is outside this toolkit. While an update waits, the App Shell of the active build answers navigations, so reloads and new tabs stay on the active Build ID until the user accepts ([ADR 0005](docs/adr/0005-pending-update-pins-navigations-to-the-active-build.md)).

## Install

```sh
pnpm add pwa-toolkit effect
```

- `effect` (peer, required): every subpath is built on it, and Worker RPC on `effect/unstable/rpc`.
- `vite` (peer, optional): needed by `pwa-toolkit/vite`.
- `react`, `react-dom` (peers, optional): needed by `pwa-toolkit/react` and `pwa-toolkit/ui`.
- `kui-toolkit` (peer, optional): the components `pwa-toolkit/ui` renders with.

## Exports

### `pwa-toolkit/vite`

| Export | What it does                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa`  | Vite plugins that emit the manifest, pick the Precache, compute the Build ID, build the worker (or the Kill Switch) and add `no-cache` rules to `_headers`. |

### `pwa-toolkit/worker`

| Export             | What it does                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `runServiceWorker` | Starts the worker; call it once at the top of the entry, optionally with a `layer` such as a Worker Server.     |
| `WorkerHost`       | Service given to that `layer`: the worker's Build ID and a stream of every non-Control Channel `message` event. |

### `pwa-toolkit/client`

| Export                      | What it does                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `PwaClient.layer`           | Builds every tab-side service below from the build info; browser only, never during SSR.       |
| `PwaRegistration`           | Service holding the tab's registration and the Build ID read from the meta tag.                |
| `PwaUpdate`                 | Service with the Update Prompt state, `check`, `apply` (a Coordinated Reload) and `navigated`. |
| `PwaInstall`                | Service with the Install Prompt state, `prompt` and `dismiss` (remembered for 30 days).        |
| `Connectivity`              | Service with an `online` ref that follows the browser's online and offline events.             |
| `DisplayMode`               | Service with the current display mode, such as `browser` or `standalone`.                      |
| `StoragePersistence`        | Service to read and request persistent storage and estimate usage.                             |
| `RuntimeCacheControl`       | Service whose `clear` deletes every Runtime Cache.                                             |
| `RuntimeCacheControl.layer` | Layer for `RuntimeCacheControl` that needs no registration.                                    |
| `UpdateState`               | Tagged enum `Idle`, `Checking`, `Available`, `Applying`, `Unsupported`.                        |
| `InstallState`              | Tagged enum `Unsupported`, `Available`, `ManualIos`, `Installed`, `Dismissed`.                 |

### `pwa-toolkit/react`

| Export                  | What it does                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `PwaProvider`           | Starts the client services after mount; pass `router` so `auto-on-navigation` updates see route changes. |
| `pwaHead`               | Head tags for the root route: manifest link, Apple tags and the Build ID meta tag.                       |
| `usePwaUpdate`          | Update state with `check` and `apply`; `Idle` before mount.                                              |
| `usePwaInstall`         | Install state with `prompt` and `dismiss`; `Unsupported` before mount.                                   |
| `useOnline`             | Whether the browser is online; `true` before mount.                                                      |
| `useDisplayMode`        | The display mode; `browser` before mount.                                                                |
| `useStoragePersistence` | Persisted flag with `persist` and `estimate`; `null` while unknown.                                      |
| `clearRuntimeCache`     | Deletes every Runtime Cache; works outside `PwaProvider`, for example in sign-out.                       |

### `pwa-toolkit/ui`

| Export             | What it does                                                                           |
| ------------------ | -------------------------------------------------------------------------------------- |
| `UpdatePrompt`     | Persistent toast while an update is available; accepting it reloads every tab into it. |
| `InstallPrompt`    | Bottom sheet on small screens, corner card on larger ones, manual steps on iOS Safari. |
| `OfflineIndicator` | "You're offline" pill in a live region, stacked above sheets.                          |

### `pwa-toolkit/worker-rpc/server`

| Export               | What it does                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `WorkerServer.layer` | Serves an Effect `RpcGroup` inside the worker; provide its handlers and pass it to `runServiceWorker`. |

### `pwa-toolkit/worker-rpc/client`

| Export            | What it does                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `TabClient.make`  | Scoped Effect that opens this tab's RPC client to the Worker Server.                     |
| `TabClient.layer` | The same client as a Layer under your own service tag.                                   |
| `VersionSkew`     | Tagged error a call fails with when the worker belongs to another Build ID than the tab. |

## Usage

### Turn a TanStack Start app into a PWA

Four pieces: the plugins in `vite.config.ts`, the head tags and provider in the root route, the Tailwind source, and an `/offline` route. Trimmed from [`apps/pwa-playground`](../../apps/pwa-playground).

```tsx
// vite.config.ts
import { createTheme } from 'kui-toolkit/components/blocks/theme';

const manifestTheme = createTheme().manifest('dark');

plugins: [
  tailwindcss(),
  tanstackStart({
    spa: { enabled: true, prerender: { outputPath: '/_shell' } },
    pages: [{ path: '/offline', prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false } }],
    prerender: { autoStaticPathsDiscovery: false },
  }),
  react(),
  pwa({ manifest: { name: 'PWA Playground', short_name: 'PWA Lab', ...manifestTheme, icons }, runtimeCache }),
],

// src/routes/__root.tsx
head: () => {
  const pwa = pwaHead();
  return { meta: [{ charSet: 'utf-8' }, ...pwa.meta], links: [{ rel: 'stylesheet', href: appCss }, ...pwa.links] };
},

function RootComponent() {
  const router = useRouter();
  return (
    <PwaProvider router={router}>
      <Outlet />
      <OfflineIndicator />
      <UpdatePrompt />
    </PwaProvider>
  );
}

/* src/styles.css */
@source '../node_modules/pwa-toolkit/dist/ui';

// src/routes/offline.tsx: the worker redirects here as /offline?from=<page>
export const Route = createFileRoute('/offline')({ component: Offline });
```

- Tailwind v4 does not scan `node_modules`, so without the `@source` line the `ui` components (built on [`kui-toolkit`](../kui-toolkit)) render unstyled.
- The build writes `sw.js`, `manifest.webmanifest`, `_shell.html`, `offline.html` and a `_headers` block with `Cache-Control: no-cache` for the worker and the manifest.
- A navigation tries the network for `navigation.networkTimeoutMs` (3 s), then a saved page (with `cachePages`), then the App Shell (with `shell`), then redirects to the Offline Fallback. The `/offline` route should only send "Try again" back to a same-origin `from`.
- Paths under `neverCache` (default `/api/auth/`), non-GET requests and `navigation.denylist` never reach the worker's caches. `runtimeCache` rules match first-wins, yours before the preset's.
- `UpdatePrompt` never reloads unasked; with `update: { mode: 'auto-on-navigation' }` a waiting version applies on the next route change instead.

### Call the service worker with Worker RPC

The worker entry `src/sw.ts` serves an Effect `RpcGroup`; each tab calls it with a Tab Client. From the playground's `src/sw.ts` and `/rpc` page.

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

// in the tab
const client = yield * TabClient.make(PlaygroundRpcs); // scoped
const reply = yield * client.Echo({ text: 'hello' });
const ticks = client
  .Ticks({ count: 20 })
  .pipe(Stream.retry(Schedule.spaced('1 second')));
```

- Each message goes through `navigator.serviceWorker.controller`, which wakes a stopped worker. A call made before the tab has a controller waits for one.
- The browser stops idle workers. The next call after an idle stop succeeds; calls in flight fail with `RpcClientError` and the Tab Client reconnects by itself.
- Streams restart from the handler's start (Subscription Restart), so the Worker Server keeps no state and each subscription emits everything a fresh subscriber needs.
- A tab of another Build ID gets `VersionSkew` on every call; answer it with `usePwaUpdate().check()`.

### Clear cached data on sign-out

Runtime Caches outlive a session, so the next person on the device would see the last one's data. Call `clearRuntimeCache()` after the sign-out request. From the playground's `/auth-sim` page.

```ts
import { clearRuntimeCache } from 'pwa-toolkit/react';

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
- It needs no `PwaProvider`; outside React, use `RuntimeCacheControl.layer`.
- `/api/auth/` is in `neverCache` by default, so session reads always hit the network and fail offline. Treat a failed read as "unknown", not as signed out.
