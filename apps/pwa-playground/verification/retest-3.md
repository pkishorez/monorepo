# retest-3: pages aren't cached while an update waits (ADR 0005)

Target: https://pr57-pwa.kishore.app, head `c4a614456` (fix `304159908`). Date: 2026-09-27.
Browser: agent-browser Chrome, session `retest-3`, fresh profile `/tmp/pwa/r3/prof`, driven over CDP (`/tmp/pwa/r3/lc.mjs`). Offline means CDP network emulation on every page and worker target with auto-attach (`/tmp/pwa/offline.mjs`); checked with `fetch('/api/time/network-only')` → `Failed to fetch`. `lc.mjs resume` released debugger-paused workers throughout.

| Deploy        | Run         | Switches | Build ID           |
| ------------- | ----------- | -------- | ------------------ |
| A0 (starting) | 36275934013 | defaults | `382e7c6a3dc28c81` |
| C1            | 36276066273 | content  | `786ff3674869bf7a` |
| C2            | 36276187322 | content  | `b9ffedccb6b02344` |
| D (final)     | 36276401178 | defaults | `c571adec9f7cff55` |

| #   | Scenario                                                         | Verdict |
| --- | ---------------------------------------------------------------- | ------- |
| 1   | C1 accepted, `/status` saved in `runtime:pages:<C1>`             | PASS    |
| 2a  | C2 waiting: new pages visited online are not saved               | PASS    |
| 2b  | C2 waiting, offline: saved `/status` works, new pages → fallback | PASS    |
| 3   | Accept C2: all tabs on C2, old caches gone                       | PASS    |
| 4   | Defaults redeployed: first visit controlled and healthy          | PASS    |

## 1. Content preset active — PASS

Opened `/status` on A0, deployed C1, `registration.update()` → `waiting: installed`, prompt shown. Clicked Reload: tab on `786ff3674869bf7a`, caches `precache:786ff…`, `runtime:pages:786ff…`, `runtime:images`; old precache gone. `runtime:pages:786ff…` held `["/status"]`.

## 2. Update waiting, not accepted — PASS

Deployed C2, `registration.update()` → `waiting: installed`, precache `b9ffedcc…` installed, prompt shown in the `/status` tab. Did not accept.

a. Online, opened new tabs `/data` and `/install` (never visited). Both loaded C2 HTML (meta `b9ffedccb6b02344`, `transferSize` ~9 KB) under the C1 worker and showed the prompt at once, as ADR 0005 describes for `content`. Pages caches afterwards: `[["pwa-toolkit:runtime:pages:786ff3674869bf7a",["/status"]]]`. Nothing new was written, and no `runtime:pages:<C2>` was created. The fix works.

b. Offline:

| Page                                            | Result                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `/status` (reload of the existing tab)          | rendered "Status", Build ID `786ff…`, `transferSize 0`, hydrated, prompt shown |
| `/status` (new tab)                             | same                                                                           |
| `/data` (reload of the tab that loaded C2 HTML) | `/offline?from=%2Fdata`, "You are offline", Try again + Reload buttons         |
| `/install` (reload and new tab)                 | `/offline?from=%2Finstall`, "You are offline"                                  |
| `/runtime-cache` (never visited, new tab)       | `/offline?from=%2Fruntime-cache`, "You are offline"                            |

No dead pages. Screenshot: `screenshots/retest-3-1.png`.

## 3. Accept C2 — PASS

Back online, marked every tab (`window.__m`), clicked Reload in `/status`. All 6 tabs reloaded once (marker cleared, `nav: reload`) onto `b9ffedccb6b02344`, no prompt. Caches: `precache:b9ffedcc…`, `runtime:pages:b9ffedcc…`, `runtime:images`. Old `precache:786ff…` and `runtime:pages:786ff…` were gone, no waiting worker. Re-marked and waited 20 s: no further reloads. Try again on `/offline?from=%2Fdata` then went to `/data` on C2.

Minor note, not a failure: tabs sitting on the Offline Fallback reload onto `/offline?from=…`, and those URLs get saved in the new pages cache (`/offline?from=%2Fdata`, `…%2Fruntime-cache`, `…%2Finstall`). Harmless, but each `from` value adds an entry. The toolkit could skip saving the fallback route.

## 4. Defaults redeployed — PASS

Deployed D (defaults; served `sw.js` has `shell:!0`, `cachePages:!1`). First visit to `/status` in a fresh browser context: `controller: activated`, Build ID `c571adec9f7cff55`, Update state Idle, Waiting none, caches only `precache:c571adec…`. In the old profile, accepting D removed `runtime:pages:*` and the C2 precache. `/status` returns 200.

Final state: pr57 on defaults, build `c571adec9f7cff55`, healthy.
