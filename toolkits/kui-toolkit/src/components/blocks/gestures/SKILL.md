---
name: kui-gestures
description: Add touch gestures (tap, double tap, pan, and a locked finger that modifies them) with kui's gestures block. Use when making a page or surface respond to gestures, when choosing which gesture triggers an action, or when a gesture misfires, fights scrolling, or breaks browser back.
---

# kui-gestures

`kui-toolkit/components/blocks/gestures`: a Gesture Zone, one XState
machine behind it, a finger layer and a debug overlay. The live demo is
`apps/pwa-playground/src/routes/gestures.tsx`.

```tsx
<GestureZone axis="x" onGesture={(event) => { … }}>
  <GestureFingers />
  {showDebug ? <GestureDebugOverlay machineClassName="…" /> : null}
  …content…
</GestureZone>
```

## The model

Every gesture is one of three actions, **tap**, **double tap** or **pan**,
optionally modified by a held finger, the **Anchor**, like a held Shift key:

| Anchor | tap | double tap | pan                                                                       |
| ------ | --- | ---------- | ------------------------------------------------------------------------- |
| none   | tap | double tap | a **swipe** along `axis` (default `'x'`); the other axis scrolls natively |
| left   | tap | double tap | free 2D pan                                                               |
| right  | tap | double tap | free 2D pan                                                               |

- The Anchor is the first finger, when a second finger lands while it is
  still within 10px of where it went down. It locks **at once**; nothing is
  timed. It is `left` if it is left of the finger landing beside it, else
  `right`, and keeps that side until it lifts.
- The lock lasts until the **Anchor** lifts. The other finger can tap,
  double tap and pan any number of times in between; lifting it never ends
  the lock. The Anchor drifting more than 24px cancels the lock.
- A second finger after the first already moved (a swipe, or the browser
  scrolling) is ignored. A third finger cancels everything until every
  finger lifts.

## Events

`onGesture` gets one small union:

```ts
type Anchor = { side: 'left' | 'right'; x: number; y: number };
type GestureEvent =
  | { kind: 'tap' | 'double-tap'; x; y; anchor: Anchor | undefined }
  | {
      kind: 'pan';
      phase: 'began' | 'changed' | 'ended' | 'cancelled';
      x;
      y;
      dx;
      dy;
      velocityX;
      velocityY;
      anchor: Anchor | undefined;
    }
  | { kind: 'anchor'; phase: 'locked' | 'released' | 'cancelled'; x; y; side };
```

- `anchor` on a tap or pan is the Anchor held while it happened; `undefined`
  means no modifier. Branch on `event.anchor?.side`.
- A tap waits ~300ms for a second tap; two taps close in time and place are
  one `double-tap` and no `tap`.
- A swipe reports its axis only: with `axis="x"`, `dy` and `velocityY` are 0.
  An Anchored pan reports both.
- `dx`/`dy` are travel since the finger went down. `velocityX`/`velocityY`
  (px/ms) come from that finger's last 100ms only: a finger held still that
  long before lifting reads 0, so it does not fling.
- The Anchor lifting mid-pan ends the pan `ended` (so a flick still coasts),
  then emits `anchor released`. Treat `cancelled` (drift, a third finger, the
  browser taking the touch, the page losing focus) as "put everything back".

## The machine

`engine/machine.ts` is the whole model as one XState v5 machine: `idle`,
`pressing`, `swiping`, `tapped`, `native`, `ignoring`, and `anchored` with
`idle`, `pressing`, `panning` and `tapped` inside it for the other finger.
It touches no DOM: `engine/engine.ts` keeps the pointers and feeds it, and
double-tap waits are delayed transitions on the actor's clock. Change
behaviour in the machine, not in the zone.

## The Gesture Zone

The element's bounds minus a strip along each side edge of the viewport
(24px; 32px on Android). Inside it the app owns touch input, in a browser tab
and installed alike. `axis="x"` sets `touch-action: pan-y` (vertical
scrolling stays native, so the zone can be a scroll container itself);
`axis="y"` sets `pan-x`. Long-press callouts and text selection are off, so
holds work. Text fields and anything under `data-gestures="off"` keep their
own touch handling.

**Capture.** Once a swipe starts or an Anchor locks, the zone holds the page
still until every finger lifts: its non-passive `touchmove` listener calls
`preventDefault()`. `touch-action` cannot change mid-touch, so this is the
only way. A finger lifting from a Captured touch does not also click what is
under it; a plain tap still clicks. A touch the browser already started
scrolling ends in `pointercancel` and cannot be Captured.

**Native scrollers step back.** Write normal CSS; the zone follows it. A touch
that starts inside an element that scrolls sideways (`overflow-x: auto` or
`scroll` with content wider than the box) or has a `touch-action` with `pan-x`,
`pan-left` or `pan-right` is never tracked: a carousel row inside the zone just
scrolls.

The edge strips belong to someone else, and a gesture started there would
fire twice or be torn away mid-swipe:

| Environment               | Edges owned by | Why                                                                                        |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| iOS Safari tab, desktop   | browser        | swipe back / forward                                                                       |
| Android, tab or installed | OS             | system back from both edges                                                                |
| iOS installed             | app            | no system edge swipe; reserved for edge gestures such as a sidebar, still outside the zone |

## Choosing gestures

- Map the three actions to three levels of commitment: tap to touch one
  thing, double tap to undo or reset, pan to move. Give left and right
  Anchors two clearly different modes, and say which one is active.
- Keep vertical movement for scrolling, unless an Anchor is held: an
  Anchored pan is Captured, so it never scrolls the page.
- Start gestures inside the zone. Gestures that must start at the screen
  edge (a drawer, swipe back) belong to App Frame, which owns edges per
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

- **Pressed:** a soft ring. A finger at rest grows a bubble inside it after
  120ms, so a quick tap or a scroll never shows one; moving shrinks it away
  fast. The bubble is only feedback; it never decides the lock.
- **Locked:** a pop (a scale overshoot and a flash ring), then a glow, a slow
  pulse, the area under the Anchor lit while the rest of the zone dims, and
  a "Left finger locked" / "Right finger locked" chip kept inside the zone
  (below the finger near its top). It fades when the Anchor lifts.
- **Panning:** a comet tail that grows and brightens with speed.
- **Tap / double tap:** one or two ring bursts at the finger.

Reduced motion drops the pop, pulse and burst growth, keeps the tail short,
and still shows the bubble and the lock. It takes no input and paints only
while fingers are down or fading. The colours are `--gf-*` custom properties
on the layer, set from kui tokens.

## Testing

- **Debug overlay.** Render `<GestureDebugOverlay />` inside the zone. It
  outlines the zone, shades and labels each edge strip with its owner, hatches
  native scrollers labelled "native", marks each finger with its pointer id,
  puts the Environment in one line in the zone's corner
  (`gesture-overlay-environment`, e.g. `ios · tab · edges browser 24px`), and
  draws the machine with the state machine visualizer, following the current
  state (`gesture-overlay-machine`, `data-state` is the state value as JSON).
  Place the machine with `machineClassName` (fixed position) where it covers
  none of the zone. It takes no input, so leave it on on a real phone.
- **Engine tests.** `engine/engine.test.ts` feeds pointer samples (`id`,
  `x`, `y`, `t`, `down`/`move`/`up`/`cancel`) to an engine on xstate's
  `SimulatedClock`, advanced a millisecond at a time, and asserts the events,
  `inspect()` (finger roles, Anchor, state value) and `captured()`. Add a
  case there for any new threshold or transition.
- **Browser automation.** Emulate a phone with touch, then drive fingers with
  CDP `Input.dispatchTouchEvent`. `touchEnd` releases the points it lists,
  so lift one finger of two with a `touchEnd` listing only that one; a
  `touchEnd` listing the others lifts the Anchor instead. Chrome does not
  scroll on two-finger drags under `pan-y`, so check Capture by the zone's
  `touchmove` events being `defaultPrevented`, not by scroll position.
