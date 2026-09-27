# regress-ui: showcase UI and view transitions

Target: https://pr57-pwa.kishore.app, head `77f816880`, build label `36287635431-1`, Build ID `d8766dfd38fd819c`, preset `app`. Date: 2026-09-27.
Browser: agent-browser headless Chrome, session `ui-regress`, fresh profile `/tmp/pwa/ui/prof`, init script `/tmp/pwa/ui/vt.js` wrapping `Document.prototype.startViewTransition`. It records the `types` passed in and, once `ready` resolves, the `::view-transition-*` animations running (`document.getAnimations()`). Offline means CDP network emulation on every page and worker target with auto-attach (`/tmp/pwa/offline.mjs`), checked with `fetch('/api/time/network-only')` → `Failed to fetch`. Workers stopped with CDP `ServiceWorker.stopAllWorkers` (`/tmp/pwa/ui/stop.mjs`).

| #   | Scenario                                                     | Before | Now     |
| --- | ------------------------------------------------------------ | ------ | ------- |
| 1a  | View transitions: direction via sidebar, prev/next, back/fwd | new    | PASS    |
| 1b  | No transition on first load, reload or same-page click       | new    | PASS    |
| 1c  | No transition under `prefers-reduced-motion: reduce`         | new    | PASS    |
| 1d  | Visual quality, both themes, desktop and mobile              | new    | PARTIAL |
| 1e  | Mobile menu sheet, 44px targets                              | new    | PASS    |
| 2   | Status: Build ID from meta, controller activated, precache   | PASS   | PASS    |
| 3a  | Manifest valid, installable (CDP)                            | PASS   | PASS    |
| 3b  | Install Prompt (Chromium): card, sheet, Not now, persisted   | PASS   | PASS    |
| 3c  | Install Prompt iOS (emulated UA): manual steps               | PASS   | PASS    |
| 4a  | Cold start offline boots the App Shell on 5 routes           | PASS   | PASS    |
| 4b  | Offline Fallback, Try again                                  | PASS   | PASS    |
| 4c  | Runtime Cache strategy cards offline                         | PASS   | PASS    |
| 4d  | `/data` loader offline (client nav and hard reload)          | PASS   | PASS    |
| 4e  | View transitions offline                                     | new    | PASS    |
| 4f  | New UI fully precached (stylesheet, fonts)                   | new    | PASS    |
| 5   | Auth: `/api/auth/*` never cached, sign-out clears runtime    | PASS   | PASS    |

## 1a-c. View transitions — PASS

Each row is one navigation; `types` is what the router passed, the animation is the one running on `::view-transition-new(page)` / `old(page)`.

| From → to                                | How               | types                        | new / old animation           |
| ---------------------------------------- | ----------------- | ---------------------------- | ----------------------------- |
| `/` → `/install`                         | sidebar           | `forward`                    | `vt-in-right` / `vt-out-left` |
| `/install` → `/status`                   | Next              | `forward`                    | `vt-in-right` / `vt-out-left` |
| `/status` → `/runtime-cache`             | Next              | `forward`                    | `vt-in-right` / `vt-out-left` |
| `/runtime-cache` → `/status`             | Previous          | `back`                       | `vt-in-left` / `vt-out-right` |
| `/status` → `/auth-sim`                  | sidebar           | `forward`                    | `vt-in-right` / `vt-out-left` |
| `/auth-sim` → `/data`                    | sidebar           | `back`                       | `vt-in-left` / `vt-out-right` |
| `/data` → `/`                            | sidebar Overview  | `back`                       | `vt-in-left` / `vt-out-right` |
| `/` → `/rpc`, then browser Back, Forward | sidebar, history  | `forward`, `back`, `forward` | as expected                   |
| `/status` → `/rpc` (390px)               | mobile menu sheet | `forward`                    | `vt-in-right` / `vt-out-left` |
| `/` → `/nope` → `/` (404)                | router, 404 link  | `fade`                       | `vt-fade-in` / `vt-fade-out`  |

- `nav-indicator` group animates at 240 ms (the active bar slides). `site-header` also has its own group, so the header cross-fades for 250 ms; it holds position.
- First load, reload and a click on the current page's own link: `__vt` stayed empty / unchanged.
- `set media light reduced-motion` (`matchMedia` true): three navigations (sidebar, sidebar, Previous) called `startViewTransition` zero times. `viewTransitionTypes` returns `false` before the router starts one, so the CSS `animation: none` guard is only a second line.

## 1d. Visual quality — PARTIAL

Screenshots `screenshots/regress-ui-{home,status,runtime-cache,rpc,install,offline}-{desktop,mobile}-{light,dark}.png` (1280×800 and 390×844), plus `regress-ui-menu-mobile-dark.png`, `regress-ui-install-sheet-mobile-light.png`, `regress-ui-install-ios-mobile-light.png`, `regress-ui-auth-sim-mobile-dark.png`.

Overall the redesign is calm and well organised: clear eyebrow → title → lead → "Try this" → panels hierarchy, even spacing, consistent cards, readable in both themes, and no horizontal overflow at 390px on any page (`scrollWidth` 390). Defects, most serious first:

1. **Light-mode text contrast below WCAG AA (fixed locally, needs redeploy).** Measured by compositing computed colours on a canvas:
   - Sidebar and menu group labels (INSTALL, OFFLINE & CACHING…, 11px mono, `text-muted-foreground/80`): 3.23:1.
   - Home scenario paths (`/install`…, 12px) and the "This build" switch names (`PWA_PRESET`…, 11px): 3.23:1.
   - Auth-sim "Sign in or out to see what happens here." (`/70`): 2.71:1 light, 4.00:1 dark.
   - With plain `text-muted-foreground` every page measured ≥4.5:1 in both themes.
2. **Destructive buttons under AA in light mode**: "Clear every Runtime Cache" and "Sign out" red on pale red, 3.97:1 at 14px. This is kui-toolkit's `destructive` variant; not changed here.
3. **Desktop Install Prompt card covers page content.** The fixed bottom-right card sits over the State panel's values and over the page's "Next: Status" link (agent-browser refused the click: "covered by … card-description"). The page leaves no room for it. Suggest bottom padding on `/install` while the card shows, or placing the card so it doesn't cover the main column.
4. **Identifiers set as body prose.** Lead paragraphs put `beforeinstallprompt`, `x-pwa-toolkit-cached-at`, `src/lib/runtime-cache-rules.ts` and `ManualIos` in Inter. At 390px `x-pwa-toolkit-cached-at` breaks across lines at its hyphens, and "(ManualIos)" reads as "Manuallos" because Inter's capital I and lowercase l look alike. Wrap them in `<code>` (mono) like the RPC page's `/rpc?fakeBuildId=other` link.
5. **Home status strip on mobile**: five cells in a two-column grid leave "Update" alone with an empty half-row. Minor.
6. **"1 entries"** on Status Cache Storage (`pwa-toolkit:runtime:images: 1 entries`). Fixed locally.
7. Install sheet (mobile): about 50px of empty space between the description and the buttons. Minor, toolkit UI.
8. `/offline` opened directly while online reads "You are offline" with an "online" badge in the header. Acceptable for a demo page, but it could say it's the fallback preview when online.

Not defects: the full-page screenshot shows the sticky header and sidebar mid-page; that is a headless full-page capture artifact. The header reads "online" during CDP offline emulation (known: emulation doesn't flip `navigator.onLine`).

## 1e. Mobile menu sheet — PASS

At 390px the menu button opens a left sheet (292×844, page blurred behind). Focus lands on Close (44×44). Every item is 276×44. Picking Worker RPC navigates with a `forward` transition and closes the sheet. Escape closes it and returns focus to the menu button. Target scan on every page at 390px: nothing under 44px except the inline prose link `/rpc?fakeBuildId=other` (185×18), which is inline text and allowed.

## 2. Status — PASS

Fresh profile, first visit, no reload: Controller `activated /sw.js`, Active `activated /sw.js`, Waiting/Installing `none`, Update state `Idle`. Build ID (meta) `d8766dfd38fd819c` equals `meta[name="pwa-toolkit:build-id"]`. Cache Storage lists `pwa-toolkit:precache:d8766dfd38fd819c: 37 entries`, matching `caches.open(…).keys()` (37: 18 JS, 1 CSS, 12 woff2, 4 icons, `/_shell`, `/offline`).

## 3. Install — PASS

- `/manifest.webmanifest` 200, name/short_name/id/start_url/scope/`display: standalone`, 4 icons, each 200 `image/png`.
- CDP on the main profile's `/install` tab: `Page.getAppManifest` `errors: []`; `Page.getInstallabilityErrors` `[]`. A new CDP browser context reports only `in-incognito`, as expected.
- Chromium: a real `beforeinstallprompt` fired. State `Available`, chip "Installable", desktop card; at 390px a bottom sheet with "Not now" and "Install" at 358×44. "Not now" set `pwa-toolkit:install-dismissed-at`, state `Dismissed`; still `Dismissed` with no sheet after a reload.
- Headless Chrome did not fire the event again on every later load (state stayed `Unsupported` / "Not offered" for a few loads). That is Chrome's heuristic, not the app.
- iOS (`set device "iPhone 14"`, iOS 16 Safari UA): state `ManualIos`, chip "Manual steps", sheet "Tap Share in the browser toolbar." / "Choose Add to Home Screen." with "Got it" at 358×44.

## 4. Offline and caching — PASS

Online first: fetched each strategy twice, pressed Reload data on `/data`. Then offline on page and worker targets, `about:blank`, stopped all workers (no `service_worker` target left).

- **Cold start** `/status`, `/`, `/runtime-cache`, `/rpc`, `/install`: each rendered its own h1, `transferSize 0`, `workerStart` > 0, controller `activated`, network-only fetch `Failed to fetch`, hydrated. Screenshot `regress-ui-coldstart-offline-desktop-light.png`.
- **Precache covers the new UI**: `styles-YaI-EOKg.css` loaded with 163 rules, `document.fonts` has `Inter Variable` and `JetBrains Mono Variable` loaded, 0 font errors, body font Inter. The only failed request was `/manifest.webmanifest` (status 0). It isn't precached; the browser refetches it on each page. Harmless offline (installed apps keep their stored manifest), and it predates this UI.
- **View transitions offline**: sidebar `/status` forward, Next forward, Overview back, sidebar `/auth-sim` forward, all with the right animations.
- **Runtime Cache cards offline**:

  | Card                   | Came from | x-served-at                        | Chip       |
  | ---------------------- | --------- | ---------------------------------- | ---------- |
  | network-first          | cache     | `02:19:23.545Z` (last online copy) | From cache |
  | cache-first            | cache     | `02:19:24.480Z` (first answer)     | From cache |
  | stale-while-revalidate | cache     | `02:19:26.908Z` (call 2's refresh) | From cache |
  | network-only           | error     | —, `Failed to fetch`               | Failed     |

- **/data**: client navigation and hard reload offline both showed `fetch 2026-09-27T02:19:36.539Z#a4e220c6` (hard reload `transferSize 0`).
- **Offline Fallback**: deleted `/_shell` from the precache, navigated to `/status` → `/offline?from=%2Fstatus`, "You are offline", card "Waiting to open /status", styled and hydrated (`regress-ui-fallback-offline-desktop-light.png`). Try again offline stayed on the fallback; after going online Try again opened `/status` from the network (`transferSize` 30031). `/_shell` put back with `cache.add` (37 entries, Build ID matches).

## 5. Auth — PASS

Signed in, read the session twice: `02:21:48.245Z` then `02:21:49.510Z`, source `network`, "cached entries" 0. No `/api/auth/*` URL in any cache. Offline, Read session gave `error: Failed to fetch`, not a stale session. Sign out left only `pwa-toolkit:precache:d8766dfd38fd819c` (images, data and three time-* caches gone). The log reads "signed out, Runtime Caches cleared".

## Fixes (local, need redeploy)

- `src/components/scenario-nav.tsx`, `src/routes/index.tsx`: `text-muted-foreground/80` → `text-muted-foreground` (group labels, scenario paths, switch names).
- `src/routes/auth-sim.tsx`: dropped the `/70` placeholder class; the text inherits the parent's `text-muted-foreground`.
- `src/routes/status.tsx`: "1 entry" / "N entries".

`pnpm lint` (tsc + laymos) and `pnpm build` pass. The app has no `test` script.
