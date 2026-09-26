---
name: pwa-toolkit
description: PWA setup with pwa-toolkit for a TanStack Start app deployed with Alchemy. Use when adding offline support, a service worker, install or update prompts, Worker RPC, or a Kill Switch to an app in this monorepo, or when one of those misbehaves.
---

`apps/pwa-playground` is the reference app: every snippet below is lifted from it and verified in a real browser (`apps/pwa-playground/verification/`). When in doubt, copy the playground, not your memory of other PWA plugins. Words like App Shell, Offline Fallback, Build ID and Kill Switch are defined in `toolkits/pwa-toolkit/CONTEXT.md`; the Exports are in `toolkits/pwa-toolkit/README.md`.

## Steps

Do them in order. Each ends on a check.

### 1. Dependencies and types

In the app's `package.json`: `"pwa-toolkit": "workspace:*"`, plus `effect` from `catalog:` and `kui-toolkit` (`workspace:*`) when using `pwa-toolkit/ui`. The app imports the toolkit's `dist`, so run `pnpm --filter pwa-toolkit build` after `pnpm install` and after any toolkit change.

In `tsconfig.json`, add `"WebWorker"` to `lib` (the worker entry is type-checked with the app). If `tsc` reports two incompatible `Plugin` types, pin one Vite copy:

```jsonc
"paths": { "vite": ["./node_modules/vite"] }
```

Done when `tsc --noEmit` passes with `pwa-toolkit/vite` imported.

### 2. `vite.config.ts`

`pwa()` goes after `tanstackStart()`. The Start options are required: they prerender the App Shell (`/_shell`) and the Offline Fallback (`/offline`), which the Precache needs.

```ts
plugins: [
  tailwindcss(),
  tanstackStart({
    spa: { enabled: true, prerender: { outputPath: '/_shell' } },
    pages: [
      {
        path: '/offline',
        prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false },
      },
    ],
    prerender: { autoStaticPathsDiscovery: false },
  }),
  react(),
  // After tanstackStart(): the worker builds after prerendering.
  pwa({
    enabled: process.env.PWA_ENABLED !== 'false', // false builds the Kill Switch
    dev: process.env.PWA_DEV === 'true',
    manifest: { name, short_name, description, theme_color, background_color, icons },
    runtimeCache, // optional; see step 7
  }),
],
```

Put the manifest icons in `public/icons/` (192, 512, maskable 512, apple-touch 180). The build warns for any icon missing from the output.

Choose `preset` by app kind (evidence: `apps/pwa-playground/verification/lifecycle.md`):

- `app` (the default): signed-in dashboards and tools. The App Shell renders any route offline, visited or not. Add Runtime Cache rules (step 7) for the data needed offline. Data fetched only during SSR is never in the tab's cache, so fetch offline-critical data in the browser (or warm it) under a network-first rule.
- `content`: docs and content sites. Visited pages come back offline with their SSR content; unvisited pages get the Offline Fallback. Saved pages belong to their Build ID and are dropped when an update activates, so they stay safe across updates; they come back once revisited.
- Offline-first tools that edit data offline: `app` plus std-toolkit's sync. That is outside this toolkit; do not build it on Runtime Cache rules.

While an update waits, navigations get the active build's App Shell, not the network, so a reload or a new tab stays on the active Build ID until the user accepts. Without the App Shell (`content`), such a page loads the new build and shows the Update Prompt at once; accepting fixes it.

Done when `pnpm build` prints no `pwa-toolkit:` warning and `dist/client` holds `sw.js`, `manifest.webmanifest`, `_shell.html`, `offline.html` and `_headers`.

### 3. Root route

```tsx
import { PwaProvider, pwaHead } from 'pwa-toolkit/react';
import { InstallPrompt, OfflineIndicator, UpdatePrompt } from 'pwa-toolkit/ui';

head: (() => {
  const pwa = pwaHead();
  return {
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      ...pwa.meta,
    ],
    links: [{ rel: 'stylesheet', href: appCss }, ...pwa.links],
  };
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
  });
```

`pwaHead()` renders the Build ID meta tag that Worker RPC and updates read, so it goes in the root `head`, spread into both `meta` and `links`. Pass `router` to `PwaProvider`; `auto-on-navigation` updates need it. Render `<InstallPrompt />` where the app should invite installs: the root, or one page (the playground uses `/install`). It shows only while install is possible and remembers a dismissal for 30 days.

Done when the SSR HTML of any page has `link rel=manifest` and `meta name="pwa-toolkit:build-id"`.

### 4. Tailwind source

Tailwind v4 skips `node_modules`, so the prebuilt UI renders unstyled without this line in the app's stylesheet (path relative to the CSS file):

```css
@source '../node_modules/pwa-toolkit/dist/ui';
```

Done when the offline pill and update toast have their background and position.

### 5. `/offline` route

With no network, no App Shell and no saved page, the worker redirects to `/offline?from=<page>`. Only send "Try again" to a same-origin `from`:

```tsx
export const Route = createFileRoute('/offline')({
  validateSearch: (search): { from?: string } =>
    typeof search['from'] === 'string' ? { from: search['from'] } : {},
  component: Offline,
});

const retryTarget = (from: string | undefined): string | undefined => {
  if (from === undefined) return undefined;
  const url = new URL(from, location.origin);
  return url.origin === location.origin ? url.href : undefined;
};
// Try again: target === undefined ? location.reload() : location.assign(target)
```

The route must not use a loader that needs the network. Done when `offline.html` is in `dist/client` and the route renders offline.

### 6. Sign-out and auth

Offline is not signed out. `neverCache` defaults to `['/api/auth/']`, so session reads always go to the network and fail offline instead of returning a stale session. Treat a failed session read as unknown and keep the user's screen; only a real answer of "no session" signs them out. Add every other auth or per-user-secret path to `neverCache` (setting it replaces the default, so keep `/api/auth/`).

Runtime Caches outlive a session. After the sign-out request, clear them:

```ts
import { clearRuntimeCache } from 'pwa-toolkit/react';

await fetch('/api/auth/sign-out', { method: 'POST' });
await clearRuntimeCache(); // every pwa-toolkit:runtime:* cache; the Precache stays
```

Done when sign-out calls `clearRuntimeCache()` and no `/api/auth/*` entry shows up in any cache after a session read.

### 7. Runtime Cache rules (optional)

Rules are first-match-wins and run before the preset's, so the catch-all goes last. `cacheName` is lowercase letters, digits and dashes.

```ts
export const runtimeCache = [
  {
    match: { origin: 'same-origin', pathPrefix: '/api/data' },
    strategy: 'network-first' as const,
    cacheName: 'data',
    networkTimeoutMs: 2000,
  },
  {
    match: { origin: 'same-origin', pathPrefix: '/api/' },
    strategy: 'network-first' as const,
    cacheName: 'api',
  },
];
```

A loader's data is cached only if the browser fetched it. A user whose only visit was the server render has nothing cached for that route and sees its error component offline, so give such routes an error component, and fetch or warm offline-critical data in the browser.

### 8. Worker RPC (only when asked)

Create `src/sw.ts`; `pwa()` uses it automatically when it exists, otherwise a built-in entry. Copy `apps/pwa-playground/src/sw.ts` (`runServiceWorker({ layer: WorkerServer.layer(Group).pipe(Layer.provide(handlers)) })`) and call it from tabs with `TabClient.make(Group)` inside a scope, as `apps/pwa-playground/src/routes/rpc.tsx` does.

- Call `runServiceWorker` synchronously at the top of the entry, once.
- The Worker Server is stateless: the browser stops idle workers. Streams must restart from scratch (`Stream.retry`) and each handler must emit everything a fresh subscriber needs.
- On `VersionSkew`, call `usePwaUpdate().check()`.

### 9. Alchemy deploy

`Cloudflare.Website.Vite` serves `dist/client` and honours the generated `_headers` (`Cache-Control: no-cache` for `/sw.js` and the manifest) and clean URLs (`/_shell` from `_shell.html`).

- A Worker also answers on its `*.workers.dev` URL unless `workersDev: false`. That is a second origin with its own worker, caches and install, and a Kill Switch deployed to the custom domain does not clean it up. Turn it off for deployed stages or treat it as a second app.
- Alchemy rebuilds only when hashed files change, not when env vars change. If the build reads switches such as `PWA_ENABLED`, write them to a file the hash covers before deploying (the playground's CI writes `build-env.txt`).
- Kill Switch: deploy once with `PWA_ENABLED=false`. Tabs that load it unregister, delete the toolkit's caches and reload. Keep it deployed until users have picked it up, then redeploy with the worker on.

Done when the deployed `/sw.js` and `/manifest.webmanifest` return `cache-control: no-cache` and `/_headers` returns 404.

## Checks

From the app: `pnpm build`, then `pnpm lint`. `vite preview` does not map `/_shell` to `_shell.html`, so the worker install fails there; copy the `previewCleanUrls` plugin from `apps/pwa-playground/vite.config.ts` before previewing locally.

In a browser, on a fresh profile:

1. First visit is controlled with no reload: `navigator.serviceWorker.controller.scriptURL` ends in `/sw.js`.
2. The meta `pwa-toolkit:build-id` equals the suffix of the `pwa-toolkit:precache:<id>` cache, and that cache holds `/_shell` and `/offline`.
3. Offline, stop all workers, open `/`: it renders from the App Shell with `transferSize` 0.
4. Offline, delete `/_shell` from the precache, open another page: the URL becomes `/offline?from=…`. Put it back afterwards with `cache.add('/_shell')`; the worker does not refill a deleted entry.

## Dev

The worker is off in `vite dev`, and a tab with it off removes any worker and toolkit caches left from an earlier build. `PWA_DEV=true pnpm dev` (`dev: true`) runs it with Build ID `dev` and an empty Precache, so everything goes to the network. Reach for it only to test the worker itself.

## Testing with CDP

- Offline must cover the service worker too. Use CDP `Network.emulateNetworkConditions` on every page and service worker target, with auto-attach (`waitForDebuggerOnStart`) so restarted workers start offline. `agent-browser set offline on` covers only the page, so the worker still reaches the network.
- CDP emulation from a separate session does not flip `navigator.onLine`; `agent-browser set offline` does. Test `OfflineIndicator` with the latter.
- Stopping the dev or preview server is no substitute: the automation Chrome waits on refused localhost connections instead of failing them.
- Stop workers with `ServiceWorker.stopAllWorkers`. agent-browser attaches to workers with wait-for-debugger, so the next worker start pauses before its script runs and every navigation hangs. Keep a CDP client calling `Runtime.runIfWaitingForDebugger` on service worker targets while you do this.
- A worker with DevTools attached is never stopped for idleness. Force stops instead of waiting for them.
- `UpdatePrompt` needs a waiting worker, which means a second deploy with a different Build ID (any client bundle change, such as a new `BUILD_LABEL`).
- Headless Chrome fires a real `beforeinstallprompt` but never resolves `prompt()`; accepted and dismissed outcomes need headed Chrome. It ignores the `display-mode` media emulation, so stub `matchMedia('(display-mode: standalone)')` to test `Installed`.
- Test Version Skew on the playground with `/rpc?fakeBuildId=other`.
