# gestures v3: Anchor, Swipe and Capture on the PR stage

Target: https://pr57-pwa.kishore.app/gestures, head `cd0435a7c`, Build ID `e3d4b5d5fb2296b2`, gestures chunk `gestures-DV2BvYFq.js`. Date: 2026-09-27.
Behaviour under test: `toolkits/ui-toolkit/src/components/blocks/gestures/SKILL.md` and the Anchor, Swipe and Capture terms in `toolkits/ui-toolkit/CONTEXT.md`.

Browser: agent-browser Chrome, fresh sessions `gv3pr-ios` and `gv3pr-android`, driven over raw CDP by `/tmp/pwa/gv3/pr.mjs` (the builder's `verify.mjs` pointed at the stage, with its own CDP plumbing and more checks).

| Profile | Viewport | UA                                | Touch                     |
| ------- | -------- | --------------------------------- | ------------------------- |
| iPhone  | 390×844  | iOS 18 Safari (`platform iPhone`) | touch emulation, 5 points |
| Pixel   | 412×915  | Android 15 Chrome 140 (Pixel 9)   | touch emulation, 5 points |

Fingers are `Input.dispatchTouchEvent`, moved in 16 ms steps. Lifting one finger of several is a `touchEnd` listing only that finger. State is read from the Field's `data-x`, `data-y`, `data-scale`, `data-pins` and `data-anchor`, the status line (`gestures-status`), the zone's `scrollTop`, and the row's `scrollLeft`. Capture is read from a passive `touchmove` listener on the zone that records `defaultPrevented`. The debug panel's `data-state` is recorded by a MutationObserver.

## Setup: fresh start, new build live

Each run first loaded `/gestures`, then cleared all site data for the origin (`Storage.clearDataForOrigin`, `all`: worker, caches, storage) and loaded it again. After the reload there was one worker registration (`/sw.js`, activated, controlling the page) and one cache, `pwa-toolkit:precache:e3d4b5d5fb2296b2`, matching the page's Build ID meta. The served gestures chunk contains the v3 chip copy (`Left finger locked`) and no `chord`, so the v3 build is live.

## Results: iPhone (390×844)

| Area    | Check                                                                 | Result |
| ------- | --------------------------------------------------------------------- | ------ |
| Layout  | Bare chrome, Field 40% of the viewport, page fixed, zone `pan-y`      | PASS   |
| No hold | Sideways swipe scrolls the grid, with momentum, Captured              | PASS   |
| No hold | Tap lights a dot                                                      | PASS   |
| No hold | Double tap resets the view                                            | PASS   |
| No hold | Vertical scroll stays native                                          | PASS   |
| No hold | Sideways row scrolls natively, grid untouched                         | PASS   |
| Left    | Lock and status appear at once                                        | PASS   |
| Left    | Lifting the other finger keeps the lock                               | PASS   |
| Left    | Tap drops a pin, twice                                                | PASS   |
| Left    | Pan moves the grid in 2D, with momentum; zone does not scroll         | PASS   |
| Left    | Lock survives several acting gestures                                 | PASS   |
| Left    | Releases only when the Anchor lifts                                   | PASS   |
| Left    | Double tap clears the pins                                            | PASS   |
| Right   | Right Anchor by relative position                                     | PASS   |
| Right   | Pan up zooms in, pan down zooms out, about the Anchor point           | PASS   |
| Right   | Tap zooms in one step (1.5×) about the Anchor                         | PASS   |
| Right   | Double tap zooms to fit the pins                                      | PASS\* |
| Rules   | Second finger after a swipe is ignored                                | PASS   |
| Rules   | Anchor drift (>24px) cancels                                          | PASS   |
| Rules   | Third finger cancels                                                  | PASS   |
| Rules   | Capture blocks `touchmove` while locked                               | PASS   |
| Rules   | A finger held still before lifting doesn't coast                      | PASS   |
| Rules   | Left and right edge strips (24px) untracked; just inside is tracked   | PASS   |
| Rules   | Reduced motion                                                        | PASS   |
| Rules   | Instructions dialog opens with v3 copy and closes                     | PASS   |
| Rules   | Back button goes to `/` with the header; browser back returns         | PASS   |
| Rules   | Debug machine panel follows the live state and sits clear of the zone | PASS   |
| Smoke   | `/`, `/status`, `/rpc` show the normal header                         | PASS   |

## Results: Pixel (412×915)

| Area    | Check                                                                 | Result |
| ------- | --------------------------------------------------------------------- | ------ |
| Layout  | Bare chrome, Field 40% of the viewport, page fixed, zone `pan-y`      | PASS   |
| No hold | Sideways swipe scrolls the grid, with momentum, Captured              | PASS   |
| No hold | Tap lights a dot                                                      | PASS   |
| No hold | Double tap resets the view                                            | PASS   |
| No hold | Vertical scroll stays native                                          | PASS   |
| No hold | Sideways row scrolls natively, grid untouched                         | PASS   |
| Left    | Lock and status appear at once                                        | PASS   |
| Left    | Lifting the other finger keeps the lock                               | PASS   |
| Left    | Tap drops a pin, twice                                                | PASS   |
| Left    | Pan moves the grid in 2D, with momentum; zone does not scroll         | PASS   |
| Left    | Lock survives several acting gestures                                 | PASS   |
| Left    | Releases only when the Anchor lifts                                   | PASS   |
| Left    | Double tap clears the pins                                            | PASS   |
| Right   | Right Anchor by relative position                                     | PASS   |
| Right   | Pan up zooms in, pan down zooms out, about the Anchor point           | PASS   |
| Right   | Tap zooms in one step (1.5×) about the Anchor                         | PASS   |
| Right   | Double tap zooms to fit the pins                                      | PASS\* |
| Rules   | Second finger after a swipe is ignored                                | PASS   |
| Rules   | Anchor drift (>24px) cancels                                          | PASS   |
| Rules   | Third finger cancels                                                  | PASS   |
| Rules   | Capture blocks `touchmove` while locked                               | PASS   |
| Rules   | A finger held still before lifting doesn't coast                      | PASS   |
| Rules   | Left and right edge strips (32px) untracked; just inside is tracked   | PASS   |
| Rules   | Reduced motion                                                        | PASS   |
| Rules   | Instructions dialog opens with v3 copy and closes                     | PASS   |
| Rules   | Back button goes to `/` with the header; browser back returns         | PASS   |
| Rules   | Debug machine panel follows the live state and sits clear of the zone | PASS   |
| Smoke   | `/`, `/status`, `/rpc` show the normal header                         | PASS   |

\* Behaviour passes: every pin ends up inside the Field. The visual review found the fitted pins sitting under the Field's controls. This is fixed in `b94121a3e`, which is verified on a local build and not yet deployed (see Defects).

The full run was repeated three times on the stage. All 31 checks passed on both profiles in the final run. Failures in the earlier runs were harness timing, not the page (see Notes).

## Evidence

Numbers are iPhone / Pixel where they differ.

**No hold.**

- Swipe 140px left: the grid moved to x −140 mid-drag and y stayed 0. It read −173 / −164 just after release and came to rest at −418 / −345, so it coasts. All 8 `touchmove` events were `defaultPrevented`.
- Tap: status `tap · light`.
- Double tap (two taps 100ms apart, 3px apart): x, y and scale went back to 0, 0, 1 and the status read `double tap · reset`, with no single tap before it.
- Vertical drag of 200px: the zone's `scrollTop` went from 0 to 262 / 266, the grid did not move, and 0 of 12 moves were prevented.
- Sideways drag on the row: its `scrollLeft` went from 12 to 252, the grid did not move, and 0 of 10 moves were prevented.

**Left Anchor.** The first finger went down at (100, y) and the second at (290, y), 60ms later.

- 30ms after the second finger landed, `data-anchor=left` and the status read `left anchor · Move`. The chip is visible in the screenshot taken then.
- A quick lift of the second finger counts as a tap (a pin), and the lock holds. Two more taps made 2 and then 3 pins.
- A pan of (−40, −120): the grid moved in both axes, with y going 0 → −80 while the finger moved. The grid kept going to −91 at release and −171 / −173 at rest. The zone's `scrollTop` stayed 0 and 10 of 10 moves were prevented.
- Then a pan held still for 250ms before lifting: the view stayed at the same values before and after.
- Five acting gestures ran under one lock (a lock-lift tap, 2 taps, 2 pans). The lock ended only when finger 1 lifted, with status `left anchor released`.
- A later double tap under a left Anchor gave 0 pins and status `left anchor · double tap · clear`, with the lock still held.

**Right Anchor.** The Anchor was at (300, y) and the other finger landed at (110, y).

- The status read `right anchor · Zoom`.
- Panning up 100px zoomed 1 → 1.52, and panning back down 60px zoomed out to 1.18. The world point under the Anchor stayed put: (300, 185.6) became (299.3, 185.3).
- A tap zoomed 1.18 → 1.77 (1.5×). The point under the Anchor stayed within 0.5px.
- A double tap fitted the 3 pins at scale 3.86 / 4. Status: `right anchor · double tap · fit`.

**Rules.**

- A second finger that landed after a 50px swipe left the status at `swipe · scroll` and set no Anchor.
- Moving the Anchor 40px after the lock gave `left anchor cancelled`.
- A third finger gave `left anchor cancelled`.
- With the lock held and no other finger down, the Anchor wiggling 6px was still Captured: 6 of 6 moves prevented.
- Swipes and taps that started at x 16 and 374 on iPhone (24px strips) or x 24 and 388 on Pixel (32px strips) moved nothing, changed no status and prevented no moves. A tap at 30 / 38 lit a dot.

**Debug panel.** The panel sits at top 48 to bottom 282 / 310, above the zone (which starts at 337.6 / 366). The Environment line reads `ios · tab · edges browser 24px` and `android · tab · edges os 32px`. The recorded `data-state` sequences:

- Anchor: `pressing → anchored.pressing → anchored.tapped → anchored.idle → anchored.pressing → anchored.panning → anchored.idle → idle`
- Swipe: `pressing → swiping → idle`
- Vertical scroll: `pressing → native → idle`
- Tap: `pressing → tapped → idle`

`ignoring` passes straight to `idle` when no finger is left, so it is never painted. That is expected.

**Reduced motion** (emulated `prefers-reduced-motion: reduce`, switched on while the page was open):

- A swipe stopped at release: the same x at 40ms and 540ms.
- A double tap reset was already at 0, 0, 1 after 360ms.
- The lock and chip still show (see `reduced-locked` screenshots).

**Dialog and back.**

- The help dialog shows the one-finger, left-locked and right-locked lines, and its Close button dismisses it.
- Tapping the back arrow (a real touch, not a click) went to `/` with the header. `history.back()` came back to `/gestures` with the zone mounted.

**Smoke.** `/`, `/status` and `/rpc` all rendered the header (`nav-home`) on both profiles.

## Defects

1. **Fit to pins put pins under the Field's controls. Fixed in `b94121a3e`.**
   - Symptom: on the stage, the right-Anchor double tap fitted the pins into the whole Field with a 40px margin. On the iPhone the top pin's head landed at y ≈ 22, under the back arrow (`right-fit.png`), and the bottom-right pin sat beside the debug toggle.
   - Fix: `fitPins` now fits into the band between the Field's top control row and its bottom row, measured from the two rows, so it also follows `safe-area-inset-top` when installed.
   - Checked on a local build of the fix, with the same script on both profiles (31/31): the pins land at y 88–249 / 88–278, clear of both rows (`right-fit-fixed.png`). Not on the stage until it is redeployed.

No engine, machine or zone defects were found.

## Visual review

On a small phone the page reads well.

- The lock is clear on both sides. The teal glow and ring mark the Anchor. The "Left finger locked" / "Right finger locked" chip sits above the finger on the side it names, inside the zone. Near the top of the zone it moves below the finger, so it never meets the Field.
- The dashed Anchor marker in the Field mirrors the finger's spot.
- The comet tail on the acting finger is easy to tell apart from the Anchor (magenta vs teal).
- The status pill is dark on a dark Field. Its backing hides the dots behind it, and the mono text is readable.
- The instructions dialog fits at 390px with room to spare.

Weaker points, none blocking:

- **Debug panel labels are tiny.** The state machine visualizer's transition labels are about 6–8 CSS px. Nested states are clipped at the panel's edge when it scrolls to follow the live state. It is a dev aid and it follows the state correctly, but it is hard to read without zooming.
- **The Environment line** in the zone's bottom corner sits over the hatched "native" row. It has its own backing, so it stays readable.
- **At high zoom (≥ 2.4×)**, grid dots can sit behind the ghost icon buttons, for example a dot under the bug icon. The icons stay legible.
- **The status text fades in** over 100ms. A screenshot taken 30ms after a lock catches it half faded. This is expected.

## Gaps emulation can't prove

- **Real finger contact.** CDP touch points are perfect: fixed 4px radius, no jitter, exact timing. Real finger noise near the 10px slop and 24px drift limits, palm contact and edge-of-screen grip are not exercised.
- **Browser and OS edge gestures.** The strips are shown to be untracked, but emulated Chrome has no Safari swipe-back or Android system back. That the page never fights them needs a real device.
- **iOS Safari itself.** Both profiles run Chromium with an iOS UA. WebKit's pointer and touch event order, `touch-action` handling and non-passive `touchmove` Capture on real Safari are unproven here. Capture was checked by `defaultPrevented`, not by watching the page stay still, because Chrome doesn't scroll on two-finger drags under `pan-y`.
- **Momentum feel.** Coasting is shown by the numbers moving on after release, not by how it feels at 120Hz.
- **Haptics.** The Android lock buzz (`navigator.vibrate(8)`) can't be felt, and iOS has no Vibration API.
- **Installed display mode.** Everything ran in a browser tab. The installed iOS edge owner (`app`) and safe-area insets were not exercised on the stage.
- **The fit fix** is verified on a local build only until the stage is redeployed.

## Notes

- The first runs had harness errors, which were fixed in the script:
  - A screenshot taken mid-pan held the finger still for more than 100ms, so the pan read as a stop and did not coast. This is correct behaviour for a held finger. The mid-pan picture now comes from its own pan.
  - A tap after a native scroll landed on the sideways row, which is correctly untracked.
- Lifting the second finger quickly right after a lock is a tap, so it drops a pin. This is by design.

## Screenshots

All in `screenshots/`, one set per profile (`ios`, `android`):

| File                                         | Shows                                              |
| -------------------------------------------- | -------------------------------------------------- |
| `gestures-v3-<p>-load.png`                   | First paint                                        |
| `gestures-v3-<p>-left-locked.png`            | Left Anchor, 30ms after the lock                   |
| `gestures-v3-<p>-left-panning.png`           | Left Anchor, other finger panning (comet tail)     |
| `gestures-v3-<p>-right-locked.png`           | Right Anchor, pins visible                         |
| `gestures-v3-<p>-right-zooming.png`          | Mid-zoom, 1.5×                                     |
| `gestures-v3-<p>-right-fit.png`              | Fit on the stage build (pin under the back arrow)  |
| `gestures-v3-<p>-right-fit-fixed.png`        | Fit with `b94121a3e`, local build                  |
| `gestures-v3-<p>-chip-near-top.png`          | Lock at the top of the zone, chip below the finger |
| `gestures-v3-<p>-debug-anchored-panning.png` | Debug on, panel on `anchored.panning`              |
| `gestures-v3-<p>-debug-idle.png`             | Debug on, idle, strips and native row labelled     |
| `gestures-v3-<p>-reduced-locked.png`         | Reduced motion, lock still shown                   |
| `gestures-v3-<p>-instructions.png`           | Help dialog                                        |
| `gestures-v3-<p>-smoke-home.png`             | `/` with the normal header                         |
