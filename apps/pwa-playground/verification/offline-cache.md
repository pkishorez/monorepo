# offline-cache verification

Target: https://pr57-pwa.kishore.app (build label `36271196823-1`, Build ID `f3560931227cac18`, preset `app`). Date: 2026-09-27.
Browser: agent-browser session `offline-cache`, fresh profile. Offline = CDP `Network.emulateNetworkConditions` on every page and service worker target (auto-attach with `waitForDebuggerOnStart`, so restarted workers are offline before they run). Helpers: `/tmp/pwa-oc/net.mjs` (`on` / `off` / `slow:<ms>`), `/tmp/pwa-oc/stopsw.mjs`, `/tmp/pwa-oc/nojs.mjs`.

| #   | Scenario                           | Verdict |
| --- | ---------------------------------- | ------- |
| 1   | Cold start offline, App Shell      | PASS    |
| 2   | Offline Fallback                   | PARTIAL |
| 3   | Network timeout → App Shell        | PASS    |
| 4   | Runtime Cache strategies           | PASS    |
| 5   | /data loader offline               | PASS    |
| 6   | Auth never cached, sign-out clears | PASS    |
| 7   | OfflineIndicator + Connectivity    | PASS    |
| 8   | SSR HTML per URL not cached        | PASS    |

## 1. Cold start offline — PASS

Steps: visited `/` online (registration active, page controlled, precache `pwa-toolkit:precache:f3560931227cac18` with 39 entries including `/_shell` and `/offline`). Opened a new blank tab, closed the first tab, went offline, stopped all workers (`ServiceWorker.stopAllWorkers`), then opened `/`, `/status` and `/runtime-cache` in the new tab.

Observed: each route booted from the App Shell and the client router rendered the correct route. `transferSize` 0, `workerStart` > 0, `fetch('/api/time/network-only')` failed with `Failed to fetch`, which proves the network was really offline. `/status` showed the Build ID from the meta tag, controller `activated /sw.js`, and the precache list. `/runtime-cache` rendered all four cards. No console errors. Screenshot: `screenshots/offline-cache-1.png`.

Test artifact: CDP network emulation from a separate session does not flip `navigator.onLine`, so the header said "online" in this run. Scenario 7 uses agent-browser's own offline toggle for that.

## 2. Offline Fallback — PARTIAL

Code order (`toolkits/pwa-toolkit/src/worker/requests/pages/pages.ts`): network within `networkTimeoutMs` (default 3000), then the saved page (only with `cachePages`), then the App Shell (only with `shell`), then the Offline Fallback. Non-GET, `neverCache` and denylisted paths skip the worker (`fetch-router.ts`).

Steps: while offline, deleted `/_shell` from the precache with page JS, then navigated to `/status`.

Observed:

- With JS disabled (CDP `Emulation.setScriptExecutionDisabled`), the served document is the Offline Fallback ("You are offline / This is the Offline Fallback…"). The worker picks the right response.
- With JS enabled, the user never sees it. The fallback is a full prerendered TanStack page with the same precached JS. On hydration the router matches `location.pathname` (`/status`) and renders the Status route, so the result looks like the App Shell. Screenshot: `screenshots/offline-cache-2.png` (Status page, served from `/offline` HTML).

Why it matters: with the `content` preset (`shell: false`), an unvisited page offline should show the Offline Fallback. It will briefly paint and then render the requested route with failing loaders.

Suggested fix, pick one:

- (a) Have `pwa()` emit the Offline Fallback without module scripts (static HTML, inline `location.reload()` for "Try again").
- (b) Mark the fallback HTML (for example a `pwa-toolkit:offline-fallback` meta tag, or a response header the worker adds) and have `PwaProvider` or the app root render the Offline route whenever the marker is present.
- (c) Serve it as a redirect to `/offline`. This one loses the original URL for retry.

Minor: after restoring the network, reloading does not put `/_shell` back. `servePrecached` fetches a missing entry from the network but never writes it back, and install only runs for a new build. I restored the entry by hand. The risk is low, because browsers evict a whole origin, not single entries.

## 3. Network timeout — PASS

Steps: 6000 ms latency on the page and the worker targets, then navigated to `/status`.
Observed: `responseStart` 3010 ms, wall time about 3.1 s. The App Shell rendered Status. The network response could not have arrived before 6 s.

## 4. Runtime Cache strategies — PASS

Rules come from `src/lib/runtime-cache-rules.ts`. Cache names are `pwa-toolkit:runtime:time-<strategy>`, `…:data`, `…:api`, plus the preset's `…:images`. network-first has `networkTimeoutMs: 2000`. No rule sets `maxEntries` or `maxAgeSeconds`, so those were not tested.

| Strategy               | Online call 1 → 2 (x-served-at)                                                | Offline                                                              |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| network-first          | `…27.025Z` → `…28.367Z` (fresh each time, no cached-at header)                 | `…28.367Z` with `x-pwa-toolkit-cached-at` (last saved copy)          |
| cache-first            | `…29.652Z` → `…29.652Z` (second call has cached-at)                            | `…29.652Z`                                                           |
| stale-while-revalidate | `…32.135Z` → `…32.135Z` (cached); call 3 → `…33.419Z` (the background refresh) | `…41.840Z` (refresh from call 3)                                     |
| network-only           | new stamp each call                                                            | `Failed to fetch`; the UI shows "Came from: error / Failed to fetch" |

Screenshot: `screenshots/offline-cache-4.png`.

## 5. /data loader route — PASS

Steps: loaded `/data` online. The server render does not touch `/api/data`, so I pressed "Reload data" to fill the `data` cache. Then went offline, did a client-side navigation from `/` to `/data`, then a hard reload offline.
Observed: both showed the cached answer (`fetch 2026-09-26T21:03:21.787Z#8c3a3757`, same generatedAt and items). The hard reload booted the App Shell and the loader ran in the browser. With the `data` cache deleted while offline, the page shows the route's error component, "Loader failed: Failed to fetch", with the header intact (`screenshots/offline-cache-5.png`). That error text is raw but clean.

Note: a user whose only visit was the server render has nothing cached for `/data`, so offline they get the error state.

## 6. Auth — PASS

Steps: online sign in, read the session twice, fetch `/api/data` and `/api/time/cache-first`, inspect every cache, then sign out.
Observed: each session read reached the network (`…56.174Z` then `…57.719Z`, no `x-pwa-toolkit-cached-at`). No `/api/auth/*` entry in any cache, and no `api` cache was created. Offline, "Read session" fails ("error: Failed to fetch") instead of returning a stale session. Sign out deleted every `pwa-toolkit:runtime:*` cache (time-*, images, data). The precache was untouched (39 entries).

## 7. OfflineIndicator + Connectivity — PASS

Steps: agent-browser `set offline on` / `off` on `/status`.
Observed: offline gives `navigator.onLine` false, the OfflineIndicator (`role=status`) shows "You're offline", the header shows "offline", and the Status "Online" row shows false. Back online, the indicator is empty, the header shows "online", and the row shows true. Screenshot: `screenshots/offline-cache-7.png`.

## 8. SSR HTML not cached per URL — PASS

Steps: online navigations to `/`, `/status`, `/runtime-cache`, `/data?q=1`, `/auth-sim`, `/update` and `/does-not-exist` (plus the earlier ones).
Observed: the only HTML entries in any cache are `/_shell` and `/offline` in the precache. No `pwa-toolkit:runtime:pages` cache exists (`cachePages: false` for the `app` preset).
