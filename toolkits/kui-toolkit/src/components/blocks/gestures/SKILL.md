---
name: kui-gestures
description: Add touch gestures (tap, double tap, sideways swipe, two-finger Chord) with kui's gestures block. Use when making a page or surface respond to gestures, when choosing which gesture triggers an action, or when a gesture misfires, fights scrolling, or breaks browser back.
---

# kui-gestures

`kui-toolkit/components/blocks/gestures`: a Gesture Zone, a recognizer engine
behind it, a finger layer and a debug overlay. The live demo is
`apps/pwa-playground/src/routes/gestures.tsx`.

```tsx
<GestureZone recognizers={['pan', 'chord']} onGesture={(event) => { … }}>
  <GestureFingers />
  {showDebug ? <GestureDebugOverlay /> : null}
  …content…
</GestureZone>
```

## The Gesture Zone

The element's bounds minus a strip along each side edge of the viewport
(24px; 32px on Android). Inside it the app owns touch input, in a browser tab
and installed alike. The zone keeps vertical scrolling native
(`touch-action: pan-y`), so it can be a scroll container itself, and turns off
long-press callouts and text selection so holds work. Text fields and anything
under `data-gestures="off"` keep their own touch handling.

**Capture.** Once a recognizer claims a touch, the zone holds the page still
until every finger lifts: its non-passive `touchmove` listener calls
`preventDefault()`. `touch-action` cannot change mid-touch, so this is the only
way. A Chord claims the moment its second finger lands, so it is Captured
before either finger moves. A touch the browser already started scrolling ends
in `pointercancel` and cannot be Captured.

**Native scrollers step back.** Write normal CSS; the zone follows it. A touch
that starts inside an element that scrolls sideways (`overflow-x: auto` or
`scroll` with content wider than the box) or has a `touch-action` with `pan-x`,
`pan-left` or `pan-right` is never tracked: a carousel row inside the zone just
scrolls. `data-gestures="off"` is the manual override for anything else.

The edge strips belong to someone else, and a gesture started there would
fire twice or be torn away mid-swipe:

| Environment               | Edges owned by | Why                                                                                        |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| iOS Safari tab, desktop   | browser        | swipe back / forward                                                                       |
| Android, tab or installed | OS             | system back from both edges                                                                |
| iOS installed             | app            | no system edge swipe; reserved for edge gestures such as a sidebar, still outside the zone |

## Recognizer vocabulary

Every `onGesture` event has `kind`, `phase`, `x`, `y`, `duration` (ms). Only
gestures that resolve unambiguously are in the set.

| kind         | fingers                  | phases                  | extra fields                                          |
| ------------ | ------------------------ | ----------------------- | ----------------------------------------------------- |
| `tap`        | 1, quick and still       | ended                   | waits ~300ms for `double-tap` to fail                 |
| `double-tap` | 1, twice                 | ended                   |                                                       |
| `pan`        | 1, sideways past 10px    | began → changed → ended | `direction`, `dx`, `distance`, `progress`, `velocity` |
| `chord`      | 1 held ≥150ms + 1 acting | began → changed → ended | `side`, `anchor`, `axis`, `dx`, `dy`, `velocity`      |

A **Chord** is decided when the second finger lands. If the first has been down
at least 150ms and moved no more than 10px, it is the Anchor and the chord
begins at once, before anything moves; otherwise nothing claims and the
browser does what it likes with the two fingers. `side` is where the Anchor is
(`left` or `right` of the acting finger); `x`, `y`, `dx`, `dy` follow the
acting finger. `axis` stays undefined until the acting finger passes 10px, then
locks to `vertical` or `horizontal` for the rest of the touch; `velocity` is
along it, in px/ms. Lifting either finger ends the chord; the Anchor drifting
more than 24px cancels it. A second finger landing during a `pan` is ignored.

Continuous gestures can end `cancelled`: a third finger landed, the browser
took the touch (`pointercancel`, usually a vertical scroll), or the page lost
focus. Treat `cancelled` as "put everything back".

Arbitration is UIKit's: every recognizer reads each touch, the first to become
certain claims it, the rest fail. `tap` waits for `double-tap` to fail, so
register only the kinds the surface uses: a zone without `double-tap` gets
instant taps.

## Choosing gestures

- Keep gestures to one or two fingers. A third finger cancels the touch,
  because iOS and Android take three-finger input for system actions.
- Map vertical movement to scrolling. The one vertical gesture is the acting
  finger of a Chord, which is Captured, so it never scrolls the page.
- Start swipes inside the zone. Gestures that must start at the screen edge
  (a drawer, swipe back) belong to App Frame, which owns edges per
  Environment.
- Give every gesture a visible control too; gestures are shortcuts, not the
  only way in.

## Following a finger

Frames never re-render React. In `onGesture`, write `transform` straight to a
ref on `began`/`changed`; on `ended`, decide with `shouldCommit({ progress,
velocity })` and land with `settle({ from, to, velocity, instant:
reducedMotion, onUpdate })`, which carries the release speed into a spring.
Past a bound, `rubberBand(overshoot, size)` gives resistance. Keep React state
for the settled result only.

For momentum instead of a target, `coast({ from, velocity, min, max, snap,
instant, onUpdate })` lets the value run on and slow by friction (motion's
`inertia`), bouncing back off `min`/`max` and coming to rest on a multiple of
`snap` for detents. It returns `{ finished, stop }` like `settle`. Rest is
judged to half a unit, so coast pixels, not 0–1 fractions.

Read `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)')` at
the moment the gesture lands. motion's `useReducedMotion` reads it once on
mount, so turning the setting on while the app is open would still spring.

## Showing fingers

Render `<GestureFingers />` inside the zone to draw every finger by its role:
a soft ring while it is undecided or part of no gesture, the Anchor locked with
a glow, a slow pulse and a "Left finger locked" chip while the zone dims around
it, and a comet tail behind the acting finger that grows with speed. It works
with the debug overlay off, takes no input, and paints only while fingers are
down or fading. Reduced motion drops the pulse and keeps the tail short. The
colours are `--gf-*` custom properties on the layer, set from kui tokens.

## Testing

- **Debug overlay.** Render `<GestureDebugOverlay />` inside the zone. It
  outlines the zone, shades and labels each edge strip with its owner, hatches
  native scrollers labelled "native", marks each finger with its pointer id,
  and puts the Environment in one line in the zone's corner
  (`gesture-overlay-environment`, e.g. `ios · tab · edges browser 24px`). It
  takes no input, so leave it on while you try gestures on a real phone.
- **Engine tests.** Recognition is pure: `engine/engine.test.ts` feeds pointer
  samples (`id`, `x`, `y`, `t`, `down`/`move`/`up`/`cancel`) and asserts the
  events, `inspect()` (finger roles, recognizer states) and `captured()`. Add
  a case there for any new threshold or conflict.
- **Browser automation.** Emulate a phone with touch, then drive fingers with
  CDP `Input.dispatchTouchEvent` (several `touchPoints` for a Chord, a timed
  wait of 150ms+ before the second finger). Chrome does not scroll on
  two-finger drags under `pan-y`, so check Capture by the zone's `touchmove`
  events being `defaultPrevented`, not by scroll position.
