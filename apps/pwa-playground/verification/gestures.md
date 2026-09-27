# gestures: Gesture Zone, recognizers and debug overlay on the PR stage

Target: https://pr57-pwa.kishore.app, head `b311960c6`, Build ID `3df34886e23d0df1` (label `36291131225-1`, defaults preset). Date: 2026-09-27.
Browser: agent-browser Chrome, fresh sessions `gpr-ios` and `gpr-android`, driven over raw CDP (`/tmp/gestures-cdp/run.mjs`, `smoke.mjs`, `rm-live.mjs`; shared plumbing in `lib.mjs`).

| Profile | Viewport | UA                                | Touch                     |
| ------- | -------- | --------------------------------- | ------------------------- |
| iPhone  | 390×844  | iOS 18 Safari (`platform iPhone`) | touch emulation, 5 points |
| Pixel   | 412×915  | Android 15 Chrome 140 (Pixel 9)   | touch emulation, 5 points |

Fingers are `Input.dispatchTouchEvent` with one to three `touchPoints`, moved in 16 ms steps; holds are timed waits. State is read from the page (`gestures-page`, `gestures-accent`, `gestures-count`, …), the overlay (`gesture-overlay-state-<kind>` `data-state`, `gesture-overlay-environment`, `gesture-overlay-claimed`, `gesture-overlay-live`, `gesture-overlay-log`) and the track's `translate3d` offset. Settling is sampled every animation frame from just before release. The overlay log is cleared between arbitration checks by toggling the Debug overlay switch off and on.

| #   | Scenario                                                      | iPhone                       | Pixel                    |
| --- | ------------------------------------------------------------- | ---------------------------- | ------------------------ |
| 1   | Loads from the worker build; overlay; strips per Environment  | PASS                         | PASS                     |
| 2   | Vertical one-finger scroll stays native                       | PASS                         | PASS                     |
| 3   | Pan: follow the finger, spring settle, slow drag springs back | PASS                         | PASS                     |
| 4   | Two-finger pan, chords, pinch, taps, long press, third finger | PASS                         | PASS                     |
| 5   | Touches starting in an edge strip are not handled             | PASS                         | PASS                     |
| 6   | Arbitration: one gesture per touch                            | PASS                         | PASS                     |
| 7   | Installed display mode flips Environment and edge owner       | PASS                         | PASS                     |
| 8   | Reduced motion                                                | PASS after fix (`b463dd3fd`) | FAIL → fixed, not re-run |
| 9   | Rapid sequences, no stuck state                               | PASS                         | PASS                     |
| S   | Smoke: home, status, rpc Echo, offline cold start `/gestures` | PASS                         | PASS                     |

## 1. Loads from the worker build — PASS

`/status`: Build ID `3df34886e23d0df1`, controller and active `activated /sw.js`, update Idle. `/gestures`: `navigator.serviceWorker.controller` activated, navigation `workerStart > 0`, meta Build ID `3df34886e23d0df1`. Overlay mounted with a full-viewport canvas (780×1688 / 824×1830 device px). Zone computed style `touch-action: pan-y`, `user-select: none`.

| Profile | Environment readout                  | Strip labels on canvas |
| ------- | ------------------------------------ | ---------------------- |
| iPhone  | `ios tab compact edges browser 24px` | BROWSER · 24PX         |
| Pixel   | `android tab compact edges os 32px`  | OS · 32PX              |

Screenshots: `screenshots/gestures-pr-ios-load.png`, `screenshots/gestures-pr-android-load.png`.

## 2. Vertical scroll stays native — PASS

| Start                 | iPhone scrollY | Pixel scrollY | During the drag                                            | Log   |
| --------------------- | -------------- | ------------- | ---------------------------------------------------------- | ----- |
| prose (y 700→300)     | 786 → 1354     | 763 → 1336    | claimed none, every recognizer `failed`, 1 `pointercancel` | empty |
| carousel (down 350px) | 1150 → 646     | 1127 → 643    | claimed none, `pan` failed, room unchanged                 | empty |

The browser took the touch and the engine cancelled cleanly: nothing was recognized, "Last" stayed `none yet`.

## 3. One-finger pan — PASS

- Swipe left 220 px: mid-drag at dx −100 the track sat at exactly −100 px (claimed `pan`). After release the offset moved over 55 frames through 27 distinct values (−220, −221, −228, −237, −250, …) and landed at exactly −358 (iPhone) / −380 (Pixel), room 2/5.
- Slow short drag (50 px over 800 ms): held at −408 / −430, released, sprang back over several frames to −358 / −380, still room 2/5, `pan ended`.
- Rubber band: dragging 250 px right from room 1 moved the track only 99 / 101 px, then it settled back to 0.

Screenshots: `screenshots/gestures-pr-*-pan-mid-drag.png` (finger trail, `pan` claimed).

## 4. Multi-finger gestures — PASS

| Gesture                          | Result (both profiles)                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Two-finger pan left / right      | Accent Indigo → Amber → Indigo, room unchanged, `two-finger-pan ended`             |
| Chord, left finger holds 300 ms  | Counter `+1`, hint `left-holds`, claimed `hold-swipe`                              |
| Chord, right finger holds, twice | Counter `-1`, hint `right-holds`                                                   |
| Pinch out, then in               | Scale ×2.20 (clamped max), then ×0.66                                              |
| Tap                              | `tap ended`, ripple played (1 WAAPI animation on the ripple span)                  |
| Double tap                       | Liked no → yes, `double-tap ended`                                                 |
| Long press 700 ms                | Claimed `long-press` (state `began`) while held; menu open; `getSelection()` empty |
| Tap elsewhere                    | Menu closed, `tap ended`, like unchanged                                           |
| Third finger during a pinch      | Pinch `cancelled`, log `pinch cancelled`, scale restored to ×0.66                  |
| Three fingers from the start     | Nothing logged, nothing changed                                                    |
| Two-finger tap                   | Room 1/5, Indigo, counter 0, liked no, ×1.00, `two-finger-tap ended`               |

Callout: a synthetic `contextmenu` with `pointerType: 'touch'` on a card was cancelled by the zone; one with `pointerType: 'mouse'` was not. Chrome has no `-webkit-touch-callout`, so the class can only be checked on a real iPhone.

Screenshots: `screenshots/gestures-pr-*-two-finger-pan.png`, `*-chord-left-holds.png`, `*-pinch-out.png`, `*-long-press-menu.png`.

## 5. Edge strips are not handled — PASS

The zone element starts at x 16, so the strips are checked inside the element. A touch the zone refuses is never fed to the engine, so the overlay keeps the previous sequence's states and live line; that and the room are the evidence.

| Profile | Start x                   | Engine touched | Room      | New log entries |
| ------- | ------------------------- | -------------- | --------- | --------------- |
| iPhone  | 20 (left strip, 24 px)    | no             | unchanged | 0               |
| iPhone  | 370 (right strip)         | no             | unchanged | 0               |
| iPhone  | 28 (control, inside zone) | yes, `pan`     | paged     | 1               |
| Pixel   | 28 (left strip, 32 px)    | no             | unchanged | 0               |
| Pixel   | 384 (right strip)         | no             | unchanged | 0               |
| Pixel   | 36 (control, inside zone) | yes, `pan`     | paged     | 1               |

Screenshots: `screenshots/gestures-pr-*-edge-strip.png` (finger in the strip mid-swipe, no trail, room unchanged).

## 6. Arbitration — PASS

Log after each action, cleared before each (both profiles identical):

| Action               | Log          |
| -------------------- | ------------ |
| Plain tap            | `tap`        |
| Double tap           | `double-tap` |
| Chord (hold + swipe) | `hold-swipe` |
| One-finger swipe     | `pan`        |
| Pinch                | `pinch`      |

No tap also logged a double tap, no chord logged a pan, no pan logged a tap.

## 7. Installed display mode — PASS

`Emulation.setEmulatedMedia` with `display-mode: standalone` is ignored by this Chrome (`matchMedia('(display-mode: standalone)')` stayed false, same as `install-status.md`). So a `matchMedia` stub for that query was injected before load and the page reloaded.

| Profile | Environment readout                       | Canvas labels |
| ------- | ----------------------------------------- | ------------- |
| iPhone  | `ios installed compact edges app 24px`    | APP · 24PX    |
| Pixel   | `android installed compact edges os 32px` | OS · 32PX     |

Installed, a swipe from the strip (x 20 / 28) was still not handled and one from just inside (x 28 / 36) paged, as the SKILL table says: iOS edges become the app's but stay outside the zone. Removing the stub and reloading returned `tab` with the tab owners. The live flip on a real `display-mode` change isn't covered, since the stub can't fire `change`.

Screenshots: `screenshots/gestures-pr-*-installed.png`.

## 8. Reduced motion — FAIL on the stage, fixed locally, needs redeploy

`Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce`, set while the page was open.

| Check                             | Live toggle (stage)              | After reload (stage)   |
| --------------------------------- | -------------------------------- | ---------------------- |
| Environment readout               | `reduced motion` shown           | `reduced motion` shown |
| Follow the finger (tx at dx −220) | −220                             | −220                   |
| Settle after release              | **springs**: 27 distinct offsets | instant: −220 → −358   |
| Tap ripple                        | **played** (1 animation)         | none                   |
| Long-press menu                   | `animation-name: none`           | `animation-name: none` |
| Gestures still recognized         | yes                              | yes                    |

Defect: the playground read reduced motion with motion's `useReducedMotion`, which reads the media query once on mount (`useState(prefersReducedMotion.current)`). Turning the setting on while the app is open left the carousel springing and the ripple playing, even though the overlay already said `reduced motion`. CSS `motion-reduce:` variants were fine.

Fix (`apps/pwa-playground/src/routes/gestures.tsx`): read `matchMedia('(prefers-reduced-motion: reduce)')` when a gesture lands (`settle({ instant })` and the ripple) instead of the hook. `toolkits/kui-toolkit/src/components/blocks/gestures/SKILL.md` now says to read it at that moment. Checked against a local `vp preview` of the fixed build with `rm-live.mjs`: normal → 26 distinct offsets and a ripple; toggled on live → the track jumps straight to its target (2 values), no ripple; toggled off → springs again. The same script against the stage still springs when toggled on. `pnpm lint` + `pnpm test` (348 tests) in kui-toolkit and `pnpm lint` + `pnpm build` in the playground pass.

Screenshots: `screenshots/gestures-pr-*-reduced-motion-live.png`.

## 9. Rapid sequences — PASS

| Sequence                                    | Result                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| 5 swipes left, 40 ms apart                  | Room 5/5, offset exactly −4 × width (−1432 / −1520), log `pan` ×5        |
| Swipe right, second swipe 60 ms into settle | Spring interrupted at −1199 / −1284, room 3/5, offset exactly −2 × width |
| 6 quick taps, then a two-finger tap         | Reset to room 1/5, `two-finger-tap ended`                                |

After each sequence the overlay still shows the last outcome (`pan ended`, the rest `failed`) until the next touch; that is by design (the engine starts over on the next first touch). A finger put down after each sequence found all eight recognizers `possible`. No stuck state.

## Smoke — PASS

| Page                           | Result (both profiles)                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                            | Home renders, 9 scenario links including Gestures, controller activated                                                                                                                                     |
| `/status`                      | Build ID `3df34886e23d0df1`, `activated /sw.js`, Idle, waiting none                                                                                                                                         |
| `/rpc` Echo                    | `hello <ts> at <iso>`, outcome Passed                                                                                                                                                                       |
| `/gestures` offline cold start | Tab closed, page and worker targets offline (`fetch('/api/time/network-only')` → `Failed to fetch`), new tab: `/gestures` rendered with zone and overlay, Build ID `3df34886e23d0df1`, a swipe paged to 2/5 |

Screenshots: `screenshots/gestures-pr-*-offline-cold-start.png`.

## Notes, not failures

- In emulation, releasing a long press sends compatibility `mousedown` + `click` (the click is swallowed by the zone), and the `mousedown` moves focus from the first menu item back to `body`. Real iOS and Android don't send mouse events after a long press, so this needs a check on a real phone before calling it a bug.
- The overlay's dashed zone outline and "GESTURE ZONE" label are drawn under the fixed app header when the zone scrolls beneath it. Cosmetic, debug only.

## Re-test after fix (b463dd3fd) — PASS (iPhone)

Stage Build ID `f6e35b025809c680` (label `36292337107-1`, the deploy run for this commit; was `3df34886e23d0df1`), `activated /sw.js`, update Idle, no waiting worker, so no update prompt to accept. Both `/status` and `/gestures` were hard reloaded. The served chunk `/assets/gestures-rIfBlecw.js` has the fix: ``pc=()=>window.matchMedia(`(prefers-reduced-motion: reduce)`).matches`` and `settle({…, instant: pc(), …})`.

Fresh agent-browser session `grm-ios`, iPhone profile (390×844, touch, 5 points), script `/tmp/gestures-cdp/rm-retest.mjs`. Reduced motion was turned on with `Emulation.setEmulatedMedia` while the page was open, with no reload in between (`matchMedia` flipped to true on the same page).

| Step                                    | Settle frames (distinct offsets)        | Ripple animations |
| --------------------------------------- | --------------------------------------- | ----------------- |
| Reduced motion off: swipe left          | 27 (−220, −221, −227, −236, …) → −358   | —                 |
| Reduced motion off: tap / double tap    | —                                       | 1 / 0             |
| Turned on live: swipe right, swipe left | 2 each (−138 → 0, −220 → −358), instant | —                 |
| Turned on live: tap / double tap        | —                                       | 0 / 0             |
| Turned off again: swipe right           | 26 → 0, springs again                   | —                 |

Gestures were still recognized with reduced motion on (`pan ended`, `tap ended`, double tap toggled liked yes → no). A double tap never plays the ripple, even with reduced motion off, because only a single tap triggers it. The single tap is the check that matters, and it went from 1 animation to 0. The Pixel profile was not re-run.

Screenshot: `screenshots/gestures-pr-reduced-motion-fixed.png` (reduced motion on, overlay shows `reduced motion`).
