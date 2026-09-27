---
name: kui-gestures
description: Add touch gestures (swipe, pinch, long press, double tap, two-finger and hold-swipe chords) with kui's gestures block. Use when making a page or surface respond to gestures, when choosing which gesture triggers an action, or when a gesture misfires, fights scrolling, or breaks browser back.
---

# kui-gestures

`kui-toolkit/components/blocks/gestures`: a Gesture Zone, a recognizer engine
behind it, and a debug overlay. The live demo is
`apps/pwa-playground/src/routes/gestures.tsx`.

```tsx
<GestureZone recognizers={['pan', 'pinch']} onGesture={(event) => { … }}>
  {showDebug ? <GestureDebugOverlay /> : null}
  …content…
</GestureZone>
```

## The Gesture Zone

The element's bounds minus a strip along each side edge of the viewport
(24px; 32px on Android). Inside it the app owns touch input, in a browser tab
and installed alike. The zone keeps vertical one-finger scrolling native
(`touch-action: pan-y`), and turns off long-press callouts and text selection
so holds work. Text fields and anything under `data-gestures="off"` keep their
own touch handling.

The edge strips belong to someone else, and a gesture started there would
fire twice or be torn away mid-swipe:

| Environment               | Edges owned by | Why                                                                                        |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| iOS Safari tab, desktop   | browser        | swipe back / forward                                                                       |
| Android, tab or installed | OS             | system back from both edges                                                                |
| iOS installed             | app            | no system edge swipe; reserved for edge gestures such as a sidebar, still outside the zone |

## Recognizer vocabulary

Every `onGesture` event has `kind`, `phase`, `x`, `y`, `duration` (ms).

| kind             | fingers                   | phases                          | extra fields                                          |
| ---------------- | ------------------------- | ------------------------------- | ----------------------------------------------------- |
| `tap`            | 1                         | ended                           | waits ~300ms for `double-tap` to fail                 |
| `double-tap`     | 1                         | ended                           |                                                       |
| `long-press`     | 1                         | began (500ms) → changed → ended |                                                       |
| `pan`            | 1, sideways               | began → changed → ended         | `direction`, `dx`, `distance`, `progress`, `velocity` |
| `two-finger-pan` | 2, sideways together      | same as `pan`                   | same as `pan`                                         |
| `pinch`          | 2, spreading/closing      | began → changed → ended         | `scale`                                               |
| `two-finger-tap` | 2                         | ended                           |                                                       |
| `hold-swipe`     | 1 held ≥250ms + 1 swiping | same as `pan`                   | + `side`: `left-holds` / `right-holds`                |

Continuous gestures can end `cancelled`: a third finger landed, the browser
took the touch (`pointercancel`, usually a vertical scroll), or the page lost
focus. Treat `cancelled` as "put everything back".

Arbitration is UIKit's: every recognizer reads each touch, the first to become
certain claims it, the rest fail. `tap` waits for `double-tap` to fail;
`pinch` and `two-finger-pan` wait for `hold-swipe`. So register only the kinds
the surface uses: a zone without `double-tap` gets instant taps.

## Choosing gestures

- Keep gestures to one or two fingers. A third finger cancels the touch,
  because iOS and Android take three-finger input for system actions.
- Map vertical movement to scrolling. Two fingers dragged vertically are
  never recognized: the page scrolls instead.
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

Read `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)')` at
the moment the gesture lands. motion's `useReducedMotion` reads it once on
mount, so turning the setting on while the app is open would still spring.

## Testing

- **Debug overlay.** Render `<GestureDebugOverlay />` inside the zone. It
  outlines the zone, shades and labels each edge strip with its owner, draws
  every pointer with a fading trail, lists each recognizer's state and which
  one claimed, logs recognized gestures with their measurements, and shows the
  Environment. It takes no input, so leave it on while you try gestures on a
  real phone.
- **Engine tests.** Recognition is pure: `engine/engine.test.ts` feeds pointer
  samples (`id`, `x`, `y`, `t`, `down`/`move`/`up`/`cancel`) and asserts the
  events. Add a case there for any new threshold or conflict.
- **Browser automation.** Emulate a phone with touch, then drive fingers with
  CDP `Input.dispatchTouchEvent` (several `touchPoints` for two-finger
  gestures, timed waits for holds) and read the overlay's `data-state`
  attributes (`gesture-overlay-state-<kind>`).
