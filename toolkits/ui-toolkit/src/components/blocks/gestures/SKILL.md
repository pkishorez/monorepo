---
name: kui-gestures
description: Add app-level touch gestures with kui's gestures block — one Gesture Zone per screen, read anywhere inside with useGesture (movement, scale, rotation) and useSwipe (one finger, one axis) as motion values. Use when a screen should respond to gestures that are not tied to one element, such as opening a sidebar, pulling to refresh, or steering a map or canvas from anywhere; or when choosing between these hooks and Motion's own element gestures.
---

# kui-gestures

`@kstackz/ui-toolkit/components/blocks/gestures`: one Gesture Zone per
screen, and two hooks that read its Gestures anywhere inside it as motion
values. The live demo is the Gesture Lab,
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
```

## The model

- **Gesture Zone** — the region where the app owns touch, for app-level
  shortcuts. Every touch in it is kept from the browser: no page scroll or
  pinch-zoom. One per screen; zones do not nest. Text entry and anything
  under `data-nogesture` keep their own touch handling.
- **Gesture** — one continuous touch, from the first finger landing to the
  last one lifting. Fingers may join and leave freely; it never ends or turns
  into something else until every finger is up. It is never classified: one
  finger moves it, two also scale and rotate it.
- **Swipe** — a one-finger Gesture read along one axis, fixed by its first
  real movement (8px). A second finger ends it as `interrupted`, and no new
  Swipe starts until every finger has lifted.
- **Interrupted** — when the browser takes the touch (Android's back
  gesture, an incoming call) or the page loses focus, the Gesture and any
  Swipe end at once with `interrupted: true`. Treat it as a cancel: snap
  back rather than complete.

Every enabled listener receives every Gesture or Swipe, wherever it lands in
the zone and wherever the listener renders, even hidden. There is no routing
to the element under the finger. Your app's state decides which listeners
are `enabled`; when two enabled listeners of one kind take the same Gesture,
development logs a warning. `enabled` is read as each Gesture or Swipe
starts.

Gestures that belong to one element, such as dragging a card or swiping one
row, are not the zone's: use Motion's own `drag` and gesture props on that
element.

## `useGesture({ enabled?, onEnd? })`

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

## `useSwipe({ enabled?, axis?, onEnd? })`

| Field        | Meaning                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| `axis`       | `'x'` or `'y'`, the current or last Swipe's axis                                  |
| `dx`, `dy`   | MotionValue, signed px along the axis: right and down positive; the other stays 0 |
| `active`     | React state: true from the move that fixes the axis until it ends                 |
| `onEnd(end)` | `axis`, `distance`, `origin`, `velocity` (px/s along the axis), `interrupted`     |

`axis` limits it to Swipes along one axis. It judges nothing: completing,
snapping and opening are decided by what you build on top, for example
`animate(value, target, { type: 'spring', velocity })` from `onEnd`.

## Not in the block yet

Tap, Hold, scrolling inside the zone, and ready-made layers such as a
sidebar or pull to refresh.
