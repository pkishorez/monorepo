# install-status — scenario results

Target: https://pr57-pwa.kishore.app, build label `36271196823-1`, Build ID `f3560931227cac18`. Tested 2026-09-27.
Browsers: agent-browser headless Chrome 151 (sessions `install-status`, `install-status-ios`, `install-status-m`, fresh profiles), plus real Safari on iOS 17.4 Simulator (iPhone 15 Pro) opened with `xcrun simctl openurl`.

| #   | Scenario                  | Verdict                                         |
| --- | ------------------------- | ----------------------------------------------- |
| 1   | First visit is controlled | PASS                                            |
| 2   | Manifest + installability | PASS                                            |
| 3   | Install Prompt (Chromium) | PASS (real accept/decline outcome NOT TESTABLE) |
| 4   | Install Prompt iOS        | PASS (partly emulated)                          |
| 5   | Display mode + storage    | PASS (persist _grant_ NOT TESTABLE)             |
| 6   | Headers                   | PASS                                            |
| 7   | Mobile viewport UI sanity | PARTIAL                                         |

## 1. First visit is controlled — PASS

Steps: fresh profile, open `/status`, no reload; inspect in page JS.
Observed:

- `performance` navigation type `navigate` (so the page never reloaded itself); `navigator.serviceWorker.controller.scriptURL` = `/sw.js`; registration `active.state` = `activated`, scope `/`.
- /status readouts: Controller `activated /sw.js`, Waiting/Installing `none`, Update state `Idle`.
- Meta `pwa-toolkit:build-id` = `f3560931227cac18` = "Build ID (meta)" readout; the cache is named `pwa-toolkit:precache:f3560931227cac18`.
- Precache has 39 entries: 22 JS chunks, 1 CSS (`styles-*.css`), 14 woff2 (Inter + JetBrains Mono), 4 icons (`/icons/*.png`), `/_shell`, `/offline`. No `.map` files, no `/favicon.svg` or other non-icon images.

## 2. Manifest — PASS

- `/manifest.webmanifest` returns 200 `application/manifest+json`. It has name, short_name, description, theme/background `#18181b`, `id`/`start_url`/`scope` `/` and `display: standalone`, plus 4 icons.
- Every icon returns 200 `image/png` at the size it declares (checked with `sips`): 192x192, 512x512, maskable 512x512, apple-touch 180x180.
- The SSR head of `/status` has `link rel=manifest`, `meta theme-color #18181b`, `mobile-web-app-capable` and `link rel=apple-touch-icon`.
- CDP `Page.getAppManifest`: `errors: []`, display `kStandalone`. `Page.getInstallabilityErrors`: `installabilityErrors: []`.

## 3. Install Prompt (Chromium) — PASS (real install NOT TESTABLE)

- A real `beforeinstallprompt` fired in headless Chrome, so no synthetic event was needed. `/install` showed state `Available` and the corner card (desktop, screenshot `install-status-3a.png`) or bottom sheet (Pixel 7 emulation).
- Clicking "Not now" set state `Dismissed` and localStorage `pwa-toolkit:install-dismissed-at` to a timestamp, and hid the card. After a reload the state was still `Dismissed` with no card, even though the event fired again.
- 30-day window: a timestamp 31 days old gives `Available` with the card shown; 29 days old gives `Dismissed`.
- NOT TESTABLE: "Open the browser prompt" calls the real `prompt()`, but headless Chrome has no install UI, so `userChoice` never resolved (outcome stayed `none yet`). The accepted and dismissed outcomes need headed Chrome.

## 4. Install Prompt iOS — PASS (partly emulated)

- Chromium emulation (`set device "iPhone 14"`, iOS 16 Safari UA, 390px wide): state `ManualIos`. A bottom sheet shows "Tap Share in the browser toolbar." and "Choose Add to Home Screen." with a "Got it" button (`install-status-4.png`). Emulated `maxTouchPoints` was 0, which is fine because the iPhone UA matches without it.
- Real iOS 17.4 Safari in the Simulator: the same ManualIos sheet appears (`install-status-4-sim.png`).
- Standalone: with `navigator.standalone = true` injected before load, state is `Installed`, display mode `standalone` and no sheet. The CDP `Emulation.setEmulatedMedia` `display-mode` feature is ignored by this Chrome (`matchMedia` stayed false). So on desktop Chromium I stubbed `matchMedia('(display-mode: standalone)')` instead, which gives `Installed` / `standalone`.
- A real Add to Home Screen launch was not tested. The Simulator could not be driven: agent-browser `-p ios` needs Appium, which is not installed.

## 5. Display mode + storage — PASS

- /status shows Display mode `browser`, Storage persisted `false` and Storage estimate "2.25 MiB of 10242.25 MiB".
- "Request persistent storage" works: `navigator.storage.persist()` resolves `false` (Chrome's engagement check refuses it), and the readout stays `false` with no error. The same happened after granting `durableStorage` through CDP. Headless Chrome never grants it, so the granted path is NOT TESTABLE.
- Small UX note: a refusal shows no message; the readout just stays `false`.

## 6. Headers — PASS

- `/sw.js`: 200, `content-type: text/javascript`, `cache-control: no-cache`.
- `/manifest.webmanifest`: 200, `cache-control: no-cache`.
- `/_headers`: 404.

## 7. Mobile viewport UI sanity — PARTIAL

Pixel 7 (412px) and iPhone 14 (390px) emulation; screenshot `install-status-7.png`.

- No horizontal overflow: `scrollWidth` equals the viewport width (412 and 390).
- InstallPrompt sheet: "Not now", "Install" and "Got it" are 44px tall and full width. Pass.
- **FAIL (minor): the sheet's close (X) button is 32x32, under 44px.**
  - Cause: `toolkits/kui-toolkit/src/components/ui/sheet.tsx`, where `SheetContent` renders its built-in close with `size="icon-sm"`.
  - Fix: in `InstallPrompt`, pass `showCloseButton={false}` (the footer already has "Not now" / "Got it"), or render a close button with a 44px hit area on small screens (for example `size="icon"` plus `min-h-11 min-w-11`).
- OfflineIndicator: the "You're offline" pill is centered at top 8px and 28px tall. It is `pointer-events-none`, so it blocks no taps.
  - While the install sheet is open, the pill sits under the sheet's blurred backdrop.
  - Otherwise it covers the header's "PWA Playground" link on narrow screens.
  - Both are cosmetic. A possible fix is to raise its z-index above the Sheet overlay.
- UpdatePrompt: NOT TESTABLE here. It needs a waiting worker, which means a redeploy, and only the lifecycle tester may do that.
