# Lifecycle verification (stage pr57)

Date: 2026-09-27. Headed Chrome via `agent-browser --session lifecycle` with a fresh profile, driven over CDP (`/tmp/pwa/lc/lc.mjs`). Offline was emulated on page and worker targets (`/tmp/pwa/offline.mjs`, verified: a page `fetch('/api/time/network-only')` failed). Redeploys used `gh workflow run deploy-pwa-playground.yml -f stage=pr57 ...`; dispatch was accepted, so no override commits were needed.

| Deploy              | Run         | Switches           | Build ID           |
| ------------------- | ----------- | ------------------ | ------------------ |
| B0 (starting point) | 36272566150 | defaults           | `593772b3c3104e05` |
| B1                  | 36273173043 | defaults           | `14c092b048fafdc5` |
| B2                  | 36273386823 | auto-on-navigation | `1bab212f17d53b51` |
| B3                  | 36273517937 | auto-on-navigation | `a6c0a90ee55b8018` |
| B4                  | 36273662499 | pwa_enabled=false  | Kill Switch        |
| B5                  | 36273805118 | defaults           | `f1057face1f10628` |
| B6                  | 36273973558 | content            | `23044e0acb7cb389` |
| B7                  | 36274166020 | content            | `83183c02c1ccd678` |
| B8 (final)          | 36274355448 | defaults           | `e16b712c9a4ccea6` |

## Results

| #   | Scenario                                    | Verdict                                                                                           |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Update Prompt + Coordinated Reload (prompt) | PASS, with one finding (reload during a pending update gives Version Skew)                        |
| 2   | auto-on-navigation                          | PASS                                                                                              |
| 3   | Kill Switch                                 | PASS                                                                                              |
| 4   | Re-enable                                   | PASS                                                                                              |
| 5   | content preset                              | PARTIAL: works as designed, but pages cached by an earlier build are dead offline after an update |
| 6   | Final defaults, healthy                     | PASS                                                                                              |

## 1. Update Prompt + Coordinated Reload (mode prompt)

Steps: tabs `/` (own window, visible), `/rpc` (visible) and `/status` (background tab in the same window), all on B0. Deployed B1.

- Before any event, all tabs stayed on B0 with no waiting worker. The periodic check runs every 60 minutes, so it was not waited out.
- Focus/visibility path, with no "check now": bringing the background `/status` tab to the front ran the check. The registration went to `waiting: installed`, `pwa-toolkit:precache:14c092b048fafdc5` was installed (39 entries), and all three tabs showed "A new version is available." `/status` showed Update state `Available`, Waiting `installed /sw.js`. Screenshot: `screenshots/lifecycle-1.png`.
- "Check now" path (tested on B1→B2): `/update` → Check now → state `Available`, prompt in all tabs.
- Declining or ignoring: after closing the toast in `/`, that tab stayed on B0 with no prompt, the old worker stayed active (version 2, 3 clients) and the new one waiting (version 3). **Finding:** a plain reload of `/rpc` while the update was waiting loaded **B1's page (Build ID `14c092b048fafdc5`, label 36273173043-1) under the B0 worker**. Echo then failed with `VersionSkew: tab 14c092b048fafdc5, worker 593772b3c3104e05`. The same happened on B5→B6 with a full navigation to `/update`. So the old _worker_ keeps running until accepted, but a reloaded or newly opened page does not stay on the old _build_.
  - Root cause: navigations are network-first (`worker/navigation/navigation.ts` `handleNavigation`), so the HTML always comes from the latest deploy. Its new hashed assets are not in the old Precache, so they come from the network too. Nothing ties the served page to the controlling worker's Build ID.
  - Suggested fix: pick one. (a) In `handleNavigation`, when a newer worker is waiting (`registration.waiting`), serve the App Shell from this build's Precache instead of network HTML, so the tab stays on the build that controls it. (b) Accept the skew and apply the waiting update on load when the page's Build ID does not match the controller's Build ID: the page is already new, so activating is safe. (c) At least document it. The Update Prompt still appears on the skewed page, so accepting fixes it.
- Accept in ONE tab (`Reload` in `/status`): all three tabs reloaded exactly once (`nav: reload`, same uptime 6 s, then 21 s later with no further reloads), including the background tab. All three were on `14c092b048fafdc5`. The old precache `593772b3...` was deleted, version 2 became `redundant`, and version 3 was active with 3 clients. No tab was left on B0, and there was no reload loop.

## 2. auto-on-navigation

B2 was loaded from B1 through the prompt (`/update` Apply update). All tabs moved to B2 and `update-mode` read `auto-on-navigation`. Then B3 was deployed.

- Foregrounding `/rpc` detected B3 (waiting installed, state Available). Nothing reloaded unasked.
- A client-side navigation in `/rpc` (clicking the header `/` link) applied it. All three tabs reloaded once onto `a6c0a90ee55b8018`, the old precache was deleted, and version 4 became redundant.
- Note: the Update Prompt toast is still shown in this mode while waiting for a navigation. That is harmless, but it is not "no prompt". If the intent is silent, hide the toast when `mode === 'auto-on-navigation'`, or keep it as a hint.

## 3. Kill Switch

Deployed B4 (`sw.js` is the Kill Switch script, `cache-control: no-cache`). Foregrounding `/status` ran the update check and the Kill Switch activated at once. The registration was deleted (`REG 2 deleted=true`), `caches.keys()` returned `[]` (every `pwa-toolkit:` cache, precache and runtime, was removed), and all three tabs reloaded once onto label 36273662499-1 with no controller. They stayed quiet over the next 20 s: no loop. Online, the app worked: `/status` rendered, `/api/data` returned 200, `getRegistrations()` returned 0 and caches stayed at 0. The disabled build does not register a worker, and the update state reads `Unsupported`.

## 4. Re-enable

Deployed B5. Tabs on the Kill Switch build cannot detect it because they have no registration. A reload is needed, which is expected. Reloading `/status` registered a new worker (REG 3), which controlled the page on first visit, with `pwa-toolkit:precache:f1057face1f10628` at 39 entries (`/_shell`, `/offline`, icons, assets).

Minor: `claimClients()` also took control of the other two tabs, which were still running the Kill Switch build's page with no toolkit client. It was harmless, and they joined properly on their next reload.

## 5. content preset (B6, B7) versus app preset (B5)

|                                                                      | app (B5)                                                                                                                            | content (B6/B7)                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precache non-asset entries                                           | `/_shell`, `/offline`                                                                                                               | `/offline` only (`shell:!1, cachePages:!0` in `sw.js`)                                                                                                                                                                       |
| Navigation cache                                                     | none                                                                                                                                | `pwa-toolkit:runtime:pages`: every successful navigation is saved (`/update /data /runtime-cache /auth-sim ...`)                                                                                                             |
| Images                                                               | cache-first `runtime:images` (200 / 30 d)                                                                                           | stale-while-revalidate `runtime:images` (300 / 30 d); only `/favicon.svg` was seen in both                                                                                                                                   |
| Offline, unvisited page (`/install`, `/status`)                      | App Shell renders it fully (the SPA works)                                                                                          | Redirect to `/offline?from=%2Finstall` (Offline Fallback)                                                                                                                                                                    |
| Offline, visited page `/data` (SSR first load only)                  | Shell renders, but the loader shows **"Loader failed: Failed to fetch"** (`runtime:data` was empty because the first visit was SSR) | Saved SSR HTML renders with its loader data                                                                                                                                                                                  |
| Offline, page visited under the **previous** build (after an update) | n/a (the shell always matches the active build)                                                                                     | **Dead page**: static SSR HTML, the entry chunk `index-CWiS-VBq.js` and route chunk fail (status 0), no `__TSR_ROUTER__`, no React props, and buttons do nothing. Pages visited after the update (`/runtime-cache`) hydrate. |
| Update flow                                                          | Prompt → Coordinated Reload                                                                                                         | Same: 2 tabs, accept in one, both reloaded onto `83183c02...`, old precache deleted                                                                                                                                          |
| Switching content → app                                              |                                                                                                                                     | `runtime:pages` deleted on activate (`keptRuntimeCaches` drops it when `cachePages` is false)                                                                                                                                |

Content preset finding (PARTIAL):

- Symptom: once a deploy is accepted, every page saved by an earlier build is served offline with HTML that points at hashed assets the new worker no longer has. The page shows text but never hydrates. Before accepting B7, 3 of the 5 saved pages referenced 2 assets missing from the B7 precache.
- Root cause: `runtime:pages` has one build-independent name (`PAGES_CACHE_NAME`) and survives `onActivate`, while `deleteOtherPrecaches` removes the old build's assets. Hashed JS/CSS is served only from the Precache (the router checks the Precache before Runtime Cache rules), so no runtime rule keeps old chunks.
- Suggested fix, simplest first: (a) scope the pages cache to the Build ID (for example `runtime:pages:<buildId>`) and delete it with the old precache, which loses offline pages until they are revisited; or clear `runtime:pages` in `onActivate` when the Build ID changes. (b) Keep old builds' hashed assets: in `onActivate`, move precached `/assets/*` entries still referenced by `runtime:pages` HTML into a runtime `assets` cache, and add a cache-first fallback for same-origin `/assets/` misses. (b) keeps offline reading across deploys but costs storage.

## 6. Final defaults

Deployed B8 (enabled, app, prompt; `shell:!0, cachePages:!1`). Both open tabs got the prompt on focus, accepting in one reloaded both onto `e16b712c9a4ccea6`, and `runtime:pages` plus the old precache were removed. A fresh browser context loading `/status` for the first time had `controller: activated` with no reload, Update state `Idle`, no waiting worker, and `pwa-toolkit:precache:e16b712c9a4ccea6` installed. The site is healthy.

## Preset recommendations

- **Signed-in dashboards and app-like SPAs → `app`.** The shell renders any route offline (visited or not) and always matches the active build, so updates are clean. Caveat from evidence: route loaders need their API calls in a Runtime Cache rule _and_ warmed by a client-side fetch. `/data` failed offline after an SSR-only first visit. Keep auth endpoints in `neverCache`.
- **Offline-capable tools → `app`**, plus explicit Runtime Cache rules for the data they need offline (network-first with a timeout, or cache-first for reference data). The shell guarantees the UI boots offline, and the update flow and Kill Switch behaved correctly.
- **Content/docs sites → `content`, but only after fixing the stale-pages issue.** Its strength is shown in the evidence: visited pages come back offline with their SSR content and loader data intact, while unvisited pages get the clear Offline Fallback instead of an empty shell. Today, though, every deploy turns saved pages into non-interactive HTML offline. For read-only docs that may be acceptable, since the text is readable, but any page that needs JS breaks. Until that is fixed, pure-static docs can use `content`, and interactive content sites should use `app`.
- Both presets: be aware of the Version Skew window in scenario 1. With an update waiting, any reload or new tab gets the new build's page under the old worker. Worker RPC reports `VersionSkew`, and accepting the prompt resolves it.
