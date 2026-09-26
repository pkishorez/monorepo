# retest-2: lifecycle findings 1 and 2, regression sweep

Target: https://pr57-pwa.kishore.app, head `4f8f3ec22`. Date: 2026-09-27.
Browser: agent-browser Chrome, session `retest-2`, fresh profile `/tmp/pwa/r2/prof`, driven over CDP (`/tmp/pwa/r2/lc.mjs`). Offline means CDP network emulation on every page and worker target with auto-attach (`/tmp/pwa/offline.mjs`); checked with `fetch('/api/time/network-only')` → `Failed to fetch`. Workers were stopped with `ServiceWorker.stopAllWorkers` while `/tmp/pwa/rpcgrp/resumer.mjs` released paused workers.

| Deploy        | Run         | Switches | Build ID           |
| ------------- | ----------- | -------- | ------------------ |
| A0 (starting) | 36274834181 | defaults | `b1871da47696958c` |
| A1            | 36275003920 | defaults | `3180b816c9532734` |
| C1            | 36275189344 | content  | `7b85bf6ae57e35dc` |
| C2            | 36275333795 | content  | `8b12837e48a238a2` |
| D (final)     | 36275534670 | defaults | `43c7e81e68058f90` |

| #   | Retest                                                         | Before  | Now  |
| --- | -------------------------------------------------------------- | ------- | ---- |
| 1   | Finding 1: reload / new tab while an update waits (app preset) | FAIL    | PASS |
| 2   | Finding 2: content preset, saved pages offline after an update | PARTIAL | PASS |
| 3   | Regression sweep on defaults                                   | PASS    | PASS |

## 1. Finding 1: pinned navigations while an update waits — PASS

Steps: tabs `/rpc` and `/status` on A0. Deployed A1. Foregrounding `/rpc` ran the check: `waiting: installed`, precache `3180b816…` installed, the prompt showed in both tabs. Then reloaded `/rpc`, and opened new tabs `/rpc` and `/data`.

| Tab               | nav type | meta Build ID      | transferSize | WorkerInfo                        | Last error | Prompt |
| ----------------- | -------- | ------------------ | ------------ | --------------------------------- | ---------- | ------ |
| `/rpc` (reloaded) | reload   | `b1871da47696958c` | 0            | `build b1871da47696958c`, Echo OK | none       | yes    |
| `/rpc` (new tab)  | navigate | `b1871da47696958c` | 0            | `build b1871da47696958c`, Echo OK | none       | yes    |
| `/data` (new tab) | navigate | `b1871da47696958c` | —            | page rendered, loader ran         | —          | yes    |

- `transferSize 0` shows the HTML came from the Precache (App Shell of the active build), not the network. No VersionSkew. Screenshot: `screenshots/retest-2-1.png`.
- Accept (Reload in the new `/rpc` tab): all 4 tabs reloaded exactly once (window marker cleared, `nav: reload`) onto `3180b816c9532734`. Old precache deleted, no waiting worker. 25 s later no further reloads. Echo/WorkerInfo on the new build OK.

## 2. Finding 2: content preset — PASS

Steps: deployed C1, accepted. Visited `/status /update /data /runtime-cache /auth-sim /rpc` online; all six were saved in `pwa-toolkit:runtime:pages:7b85bf6ae57e35dc`. Deployed C2, detected, accepted.

- Caches after accepting: `precache:8b12837e…`, `runtime:pages:8b12837e…` (only `/rpc`, the page reloaded after the update), `runtime:images`, `runtime:data`. The old `runtime:pages:7b85bf6a…` was gone.
- Offline revisit:

| Page                                                              | Result                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `/status /update /data /runtime-cache /auth-sim` (saved under C1) | redirect to `/offline?from=%2F<page>`, "You are offline", 0 asset failures |
| `/install` (never visited)                                        | redirect to `/offline?from=%2Finstall`                                     |
| `/rpc` (saved under C2)                                           | rendered, 0 asset failures, Echo and WorkerInfo worked offline             |

- Offline Fallback is interactive: Try again (still offline) reloaded and landed on the same `/offline?from=%2Fstatus`. No dead page anywhere. Screenshot: `screenshots/retest-2-2.png`.
- As ADR 0005 says for `content` (no App Shell): while C2 waited, reloading `/rpc` loaded C2's page (`8b12837e…`) under the C1 worker, the prompt showed at once, and Worker RPC answered `VersionSkew: tab 8b12837e48a238a2, worker 7b85bf6ae57e35dc`. Accepting fixed it. Expected per the ADR.
- Not tested, from reading the code: in that same window the C1 worker saves C2's HTML into `runtime:pages:<C1>` (`savePage(info.buildId, …)`). If the user goes offline **without** accepting, that saved page references C2 assets, but assets are only served from the C1 Precache (`precache.ts` `matchPrecache(buildId, …)`), so it would likely be a dead page until the update is accepted. Possible fix: in `handleNavigation`, skip `savePage` when the response's Build ID differs from `info.buildId`, or when `hasWaitingWorker()` is true.

## 3. Regression sweep on defaults (D) — PASS

- Content → app switch: accepting D removed `runtime:pages:*` and the old precache.
- First visit, fresh browser context, `/status`: `controller: activated`, meta Build ID `43c7e81e68058f90`, Update state Idle, Waiting none, only `precache:43c7e81e…`.
- Cold start offline: offline + all workers stopped (0 worker targets), then `/` rendered ("PWA Playground", `transferSize 0`, `workerStart > 0`); stopped again, `/status` rendered ("Status", controller activated).
- Runtime Cache strategies (3 fetches each, 400 ms apart, `now` values):
  - online: network-first fresh each time; cache-first same cached value 3 times; stale-while-revalidate first returned the older cached value, then newer; network-only fresh.
  - offline: network-first, cache-first, SWR returned cached values; network-only failed. Correct.
- Offline Fallback: offline, deleted `/_shell` from the precache, opened `/data?q=1` → `/offline?from=%2Fdata%3Fq%3D1` via redirect, "You are offline". `/_shell` restored by hand with `cache.add` afterwards.
- Echo after stopping the worker: WorkerInfo start time changed (`22:16:21` → `22:16:53`), Echo replied, Last error none.
- Retrying Ticks, worker stopped after tick 3: `restarting` at ~5 s with `WorkerReceiveError`, `streaming subs=2` at ~6 s, `done` with all 20 ticks; Last error went back to `none` (the round-1 "stale Last error" nit is fixed).
- Kill Switch: not retested (not needed).

Final state: pr57 on defaults (`shell:!0, cachePages:!1`), build `43c7e81e68058f90`, `/status` returns 200, healthy.
