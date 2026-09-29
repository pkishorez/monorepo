---
name: kui-gestures
description: Add touch gestures with kui's gestures block — a GestureProvider at the root, nested GestureZones for the areas that own touch, and useGesture, which reports every finger of a touch as motion values and leaves what it means to the app. Use when a screen or element should respond to gestures such as opening a sidebar, pulling to refresh, swiping a row, pinching a card, or a multi-finger swipe; or when choosing between it and Motion's own element gestures.
---

# kui-gestures

`@kstackz/ui-toolkit/components/blocks/gestures`: a `GestureProvider`,
`GestureZone`s that nest, and `useGesture`, which reads the Gestures its
nearest zone hears.

```tsx
// The whole app is a zone; the inbox list is one inside it; each row is one
// inside that, trapped while its actions are open. The Motion card is
// Motion's own.
<GestureProvider>
  <GestureZone className="fixed inset-0">
    <Sidebar />
    <GestureZone>
      <PullToRefresh />
      {rows.map((row) => (
        <GestureZone key={row.id} trapped={row.actionsOpen}>
          <RowActions row={row} />
        </GestureZone>
      ))}
    </GestureZone>
    <motion.div drag data-zone-gesture="disabled" />
  </GestureZone>
</GestureProvider>;

function RowActions({ row }) {
  useGesture({
    onEnd: (pointers, { interrupted }) => {
      const [first] = pointers.values();
      if (interrupted || pointers.size !== 1 || first === undefined) return;
      if (first.dx.get() < -60) row.open();
      if (first.dx.get() > 60) row.close();
    },
  });
  // ...
}
```

## The model

- **Gesture Provider** — follows every finger for the zones inside it and
  runs one Gesture at a time. Usually one at the app's root; separate
  sections may each have their own.
- **Gesture Zone** — an area where the app, not the browser, owns touch.
  A `div` that takes every div prop, so it can be the card itself. Zones
  nest and sit side by side.
- **Gesture** — one continuous touch, from the first finger landing in a
  zone to the last one lifting. Every finger that lands in between,
  wherever it lands, is part of it. It is never classified: pan, pinch,
  swipe or one finger holding while another moves are meanings your app
  reads from it.
- **Pointer** — one finger of a Gesture. A lifted Pointer stays in the
  Gesture until it ends.
- **Interrupted** — the browser took the touch (a Native Scroll, Android's
  back gesture, an incoming call) or the page lost focus. The Gesture ends
  at once with every finger lifted where it was. Treat it as a cancel.

## Who hears a Gesture

The first finger decides, once, as it lands:

1. Find the innermost zone under it.
2. That zone hears the Gesture, then the zone around it, and so on up. The
   walk stops at the first zone with `trapped`, which still hears it.
3. Every enabled `useGesture` in those zones takes the Gesture. A hook
   belongs to its nearest `GestureZone` in the React tree.

Later fingers join the same Gesture wherever they land; who hears it does
not change. Sibling zones never hear each other. `trapped` and `enabled` are
read as each Gesture starts, so they can follow your app's state, such as
`trapped={optionsOpen}`.

From coarse to fine, the controls are: nesting zones; `trapped` on a zone;
`enabled` on a hook; `data-zone-gesture` on any element; and your handlers,
which check direction, finger count, timing, or which element the first
finger landed on (`pointer.target`). When a card's swipe left and the
sidebar's swipe right both start on the card, leave the card untrapped and
let each act on its own direction.

A zone rendered through a portal still reaches its provider through React,
but hears only fingers that land in it in the DOM.

## `useGesture({ enabled?, onStart?, onPointer?, onEnd? })`

Returns `pointers`, a `MotionValue<ReadonlyMap<number, Pointer>>` of every
finger of the Gesture under way by id, in landing order and lifted ones
included, empty between Gestures; and `active`, React state that is true
from the first finger landing until the last lifts.

| Callback                       | When                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `onStart(pointers)`            | The first finger landed                                          |
| `onPointer(pointer, pointers)` | A finger landed or lifted; `pointer` is that finger              |
| `onEnd(pointers, end)`         | The last finger lifted; `end` is `{ interrupted, preventClick }` |

Nothing fires as fingers move: read that from each Pointer's motion values.

| `Pointer` field | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| `id`            | The browser's pointer id                                                        |
| `target`        | The element it landed on                                                        |
| `start`         | `{ x, y, t }`: where it landed in viewport px; `t` in ms from the first landing |
| `x`, `y`        | MotionValue, viewport px: where it is now, or where it lifted                   |
| `dx`, `dy`      | MotionValue, px: how far from where it landed                                   |
| `end`           | `{ x, y, t }` once it lifted; none while it is down                             |

Motion values give velocity with `getVelocity()`. A Pointer's motion values
are its own for that Gesture; the next Gesture has new ones.

## Clicks under the zone

The block never decides whether a Gesture clicks what is under it: the
browser does, as it would outside a zone. It skips the click when the touch
moved or used several fingers. A finger lifting while others stay down never
clicks. Call `preventClick()` in `onEnd` when your app acted on the Gesture
and the last release must not click. A mouse drag released on the element
it started on does click, so call `preventClick()` there too.

## Scrolling inside a zone

By default an element that can scroll keeps a one-finger touch that moves
the way it can still scroll, decided at the first movement; the Gesture it
started ends as interrupted. Only elements between the finger and the
innermost zone around it count, so a card zone inside a scrolling list takes
its own touches. Everything else is the zone's, including a scroller already
at its end and two fingers. While a Gesture runs nothing scrolls, not even
under a finger on a `disabled` element: the browser treats every finger on
the screen as one touch. `data-zone-gesture` changes
that for an element and what it holds; the nearest one decides:

| Value      | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `enabled`  | The zone takes every touch here, even what a scroller would keep   |
| `disabled` | The zone never takes a touch here: a slider, a map with its own UI |

A finger landing on a `disabled` element never starts a Gesture and never
joins one. Text entry is always left alone. Nothing in a zone zooms the page.

## With Framer Motion

An element that uses Motion's own `drag`, `whileTap` or `onPan` inside a
zone should be marked `data-zone-gesture="disabled"`. Otherwise the zone
also follows the finger and holds the browser back, and one touch gets two
reactions. Outside every zone, or with no provider, nothing here runs.

## Not in the block yet

Helpers that read Pointers: pan, pinch and rotation, N-finger swipes, and
one finger holding while others move. The Gesture Lab in
`apps/pwa-playground` is a placeholder until its demo is rebuilt.
