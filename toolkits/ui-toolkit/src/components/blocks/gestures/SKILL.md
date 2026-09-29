---
name: kui-gestures
description: Add app-level touch gestures with kui's gestures block — one Gesture Zone per screen, read anywhere inside with useGesture (movement, scale, rotation), usePan (one finger), useSwipe (one finger, one axis) and useTap, each optionally under the Hold from the bottom-left corner. Use when a screen should respond to gestures that are not tied to one element, such as opening a sidebar, pulling to refresh, or steering a map or canvas from anywhere; or when choosing between these hooks and Motion's own element gestures.
---

# kui-gestures

`@kstackz/ui-toolkit/components/blocks/gestures`: one Gesture Zone per
screen, and hooks that read its Gestures anywhere inside it. The live demo is the Gesture Lab,
`apps/pwa-playground/src/routes/-gestures/`.

```tsx
<GestureZone className="fixed inset-0">
  <Canvas />
  <Sidebar />
</GestureZone>;

function Canvas() {
  const { x, y, scale, rotation, origin, active } = useGesture({
    onEnd: (end) => save(end),
  });
  // ...
}

function Sidebar() {
  const { axis, dx, dy, active } = useSwipe({
    axis: 'x',
    enabled: !open,
    onEnd: ({ distance, velocity, interrupted }) => decide(),
  });
  // ...
}

function Toolbar() {
  const hold = useHold(); // boolean
  useTap({ hold: true, onTap: ({ point }) => resetView() });
  // ...
}
```

## The model

- **Gesture Zone** — the region where the app owns touch, for app-level
  shortcuts. One per screen; zones do not nest.
- **Gesture** — one continuous touch, from the first finger landing to the
  last one lifting. Fingers may join and leave freely; it never ends or turns
  into something else until every finger is up. It is never classified: one
  finger moves it, two also scale and rotate it.
- **Swipe** — a one-finger Gesture read along one axis, fixed by its first
  real movement (8px). A second finger ends it as `interrupted`, and no new
  Swipe starts until every finger has lifted.
- **Tap** — one finger touching and lifting without moving 8px. It is also a
  Gesture that did not move. Two fingers are never a Tap, except that a tap
  beside a resting finger is a Tap under that Hold.
- **Hold** — a mode, like a held Shift key: a finger on the bottom-left
  Hold Zone (a quarter circle, 40% of the zone's width up to 200px, or
  `holdRadius`) puts every Gesture the other fingers make under the Hold. It
  is live only while some enabled listener takes `hold: true`; otherwise the
  corner is ordinary screen. When no enabled `useGesture` without a Hold
  expects a pinch, the Hold starts the moment another finger lands beside
  the corner finger, and the corner glows faintly as the corner finger lands.
  When one does, the corner finger must press still for 300ms, shown by a
  filling ring, so fingers landing together stay a pinch; the Hold then
  ticks (a short vibration on Android, and a soft click unless
  `holdSound={false}`). Until the
  Hold starts, the corner finger is ordinary: lifting, it is a Tap that
  clicks; moving, a Gesture. Once on, the Hold lasts until every finger
  lifts, even after the Hold finger lifts. Under it nothing is clicked and
  nothing scrolls.
- **Interrupted** — when the browser takes the touch (a Native Scroll,
  Android's back gesture, an incoming call) or the page loses focus, the
  Gesture and any Swipe end at once with `interrupted: true`. Treat it as a
  cancel: snap back rather than complete.

Every enabled listener under the Gesture's Hold receives every Gesture,
Swipe or Tap, wherever it lands in the zone and wherever the listener
renders, even hidden. There is no routing to the element under the finger.
Each listener takes Gestures either under the Hold (`hold: true`) or with
none (the default); to act the same in both, add two listeners. Your app's state decides which listeners are `enabled`; when two
enabled listeners of one kind take the same Gesture, development logs a
warning. `enabled` and `hold` are read as each Gesture, Pan, Swipe or Tap starts.

Gestures that belong to one element, such as dragging a card or swiping one
row, are not the zone's: use Motion's own `drag` and gesture props on that
element.

## Scrolling inside the zone

By default an element that can scroll keeps a one-finger touch with no Hold
that moves the way it can still scroll, decided at the first movement; the
Gesture it started ends as interrupted. Everything else is the zone's,
including a scroller already at its end, two fingers, and anything under a
Hold. `data-zone-gesture` changes that for an element and what it holds; the
nearest one decides:

| Value      | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `enabled`  | The zone takes every touch here, even what a scroller would keep   |
| `disabled` | The zone never takes a touch here: a slider, a map with its own UI |

Text entry is always left alone. Nothing in the zone zooms the page.

## `useGesture({ enabled?, hold?, onEnd? })`

| Field        | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| `x`, `y`     | MotionValue, px: how far the point under the first finger has moved             |
| `scale`      | MotionValue, multiplier from 1                                                  |
| `rotation`   | MotionValue, degrees, clockwise positive                                        |
| `origin`     | Where the Gesture started, viewport px: the point scale and rotation turn about |
| `active`     | React state: true from the first finger down until the last lifts               |
| `onEnd(end)` | Final values, `origin`, `velocity` of each value per second, `interrupted`      |

Scale and rotate about `origin`, then move by `x` and `y`, and what was under
the fingers stays under them. The values are relative to the Gesture's
start and have no bounds: keep your own running position (a camera, an
offset) and fold each Gesture into it in `onEnd`. They keep their last
values until the next Gesture starts, then begin again from 0 (scale 1).

## Pinch or Hold: choose per screen

A one-finger screen (only `usePan`, `useSwipe` and `useTap`) gets the
quickest Hold: it starts as soon as a second finger lands. A screen that
pinches or rotates with `useGesture` keeps its pinches, and its Hold takes
the 300ms press. Mixing both on one screen works, but a pinch that starts
in the corner can then become a Hold after a slow second finger: prefer
one or the other per screen, and use `usePan` rather than `useGesture`
whenever one finger is enough.

## `usePan({ enabled?, hold?, onEnd? })`

| Field        | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `x`, `y`     | MotionValue, px: how far the one finger has moved                   |
| `origin`     | Where the Pan started, viewport px                                  |
| `active`     | React state: true from the finger landing until it lifts or ends    |
| `onEnd(end)` | Final `x`, `y`, `origin`, `velocity` (px/s each way), `interrupted` |

A second finger, or the browser taking the touch, ends it as interrupted.

## `useSwipe({ enabled?, hold?, axis?, onEnd? })`

| Field        | Meaning                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| `axis`       | `'x'` or `'y'`, the current or last Swipe's axis                                  |
| `dx`, `dy`   | MotionValue, signed px along the axis: right and down positive; the other stays 0 |
| `active`     | React state: true from the move that fixes the axis until it ends                 |
| `onEnd(end)` | `axis`, `distance`, `origin`, `velocity` (px/s along the axis), `interrupted`     |

`axis` limits it to Swipes along one axis. It judges nothing: completing,
snapping and opening are decided by what you build on top, for example
`animate(value, target, { type: 'spring', velocity })` from `onEnd`.

## `useTap({ enabled?, hold?, onTap })`

`onTap({ point })` fires as the finger lifts, with where it touched in
viewport px. It never waits for a second Tap. With no Hold, what is under the
finger is still clicked as usual.

## `useHold()`, the glow and the ring

`useHold()` returns whether the Hold is on, as React state. The zone sets
`data-hold` on itself while it is on. The Hold Zone itself lights up, a
quarter-circle `data-slot="gesture-hold"` element glowing out from the
corner: `data-phase` is `armed` (faint: a corner finger ready to start it),
`pressing` (faint, with the ring) or `on`, and
`data-active` is set while it is on. While a corner finger presses for the
Hold, a ring (`data-slot="gesture-hold-ring"`) fills around it. Tint both
with `--gesture-hold`; it is the foreground colour by default.

The zone also sets `data-state` to its machine's state (`idle`, `pressing`,
`armed`, `arming`, `moving`, `multi`, `held.acting` or `held.waiting`),
which helps when a Gesture does not do what you expect.

## Not in the block yet

Ready-made layers such as a sidebar, pull to refresh or snapping.
