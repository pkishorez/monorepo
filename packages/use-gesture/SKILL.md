---
name: use-gesture
description: Add touch gestures with @kstackz/use-gesture — a GestureProvider at the root, nested GestureZones for the areas that own touch, Patterns such as useSidebar and usePullToRefresh, Recognizers such as useSwipe, and useGesture, which reports every finger of a touch as motion values. Use when a screen or element should respond to gestures such as opening a sidebar, pulling to refresh, swiping a row, pinching a card, or a multi-finger swipe; or when choosing between it and Motion's own element gestures.
---

# use-gesture

`@kstackz/use-gesture`: a `GestureProvider`, `GestureZone`s that nest, and
three layers of hooks that read the Gestures their nearest zone hears. Reach
for the highest one that fits:

1. **Patterns** — `useSidebar`, `usePullToRefresh`: one UI behaviour, done.
2. **Recognizers** — `useSwipe`: one generic meaning, with live feedback.
3. **Core** — `useGesture`: every finger, and nothing else.

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
  A `div` that takes every div prop, so it can be the card itself. It
  sets only touch defaults, as inline style that `style` overrides:
  `overscroll-behavior: contain`, no text selection and no iOS callout. It
  sets no `position`. Zones nest and sit side by side.
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

## `useGesture({ enabled?, onStart?, onPointer?, onEnd?, captures? })`

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

`captures(point)` claims a touch whose first finger landed at `point` (viewport
px) even over an element that could scroll it, as `data-zone-gesture="enabled"`
does for an element. It is asked at the touch's first movement, so taps are
never affected. A Swipe with `from` uses it to own its edge.

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

The package never decides whether a Gesture clicks what is under it: the
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

## Patterns

Hooks only: each returns motion values and state, and you render it. Put the
hook inside the zone whose Gestures it should hear.

```tsx
const sidebar = useSidebar({ side: 'left', width: 280, open, onOpenChange });
<motion.aside style={{ x: sidebar.x }} />
<motion.div style={{ opacity: sidebar.progress }} onClick={() => sidebar.setOpen(false)} />

const pull = usePullToRefresh({ onRefresh: () => refetch(), distance: 72 });
<motion.div style={{ y: pull.y }}>{pull.state}</motion.div>
```

| Pattern            | Options                                                                           | Returns                                        |
| ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `useSidebar`       | `side`, `width`, `open`/`defaultOpen`, `onOpenChange`, `edge` (opt-in), `enabled` | `x`, `progress`, `open`, `setOpen`, `dragging` |
| `usePullToRefresh` | `onRefresh` (may return a promise), `distance` (72), `enabled`                    | `y`, `progress`, `state`                       |

A sidebar opens from a Swipe toward open that starts anywhere, or, with
`edge`, only within that many px of its side; a touch there is then always
the sidebar's, even over a list that scrolls. It closes from a Swipe back
anywhere; it settles by where the momentum would
carry it, past half its width. A pull arms at `distance` of indicator travel,
which takes twice that pull, and holds at `distance` while `onRefresh`
runs. It starts only where the list is already at its top.

## `useSwipe`

```tsx
const swipe = useSwipe({
  direction: 'down', // 'up' | 'down' | 'left' | 'right'
  fingers: 2, // exact, or [min, max]; 1 by default
  from: { edge: 'top', within: 24 }, // optional; owns touches there
  commit: { velocity: 800 }, // { distance: 80, velocity: 500 } by default
  onStart, // Tracking: the axis locked with the right fingers
  onCommit, // (release) => …
  onCancel, // (reason, release?) => …
});
// swipe.offset, swipe.progress, swipe.velocity, swipe.willCommit: MotionValues
// swipe.state: 'idle' | 'possible' | 'tracking'
```

- It is `possible` from the first finger landing where `from` asks. After
  10px it locks: moving the wrong way Cancels with `direction`, the wrong
  finger count with `fingers`.
- While `tracking`, `offset` follows the average of the fingers toward
  `direction` and clamps at 0 when they come back.
- It decides as the **first** finger lifts. It Commits when `offset` reaches
  `distance` or the release velocity reaches `velocity`; otherwise it Cancels
  with `short`. A finger landing after it locks Cancels with `fingers`; the
  browser taking the touch Cancels with `interrupted`.
- `willCommit` says at every moment whether letting go now would Commit.
  Velocity is measured over the last 100ms, so it falls while the fingers
  rest: a flick that stops shows it before the finger lifts.
- A flick is `commit: { velocity }` with no `distance`.
- `release` has `offset`, `velocity` and `projected`, where momentum would
  carry it, for choosing where to settle.

Recognizers never know about each other. Two that hear one Gesture can both
Commit: keep them apart with `enabled`, `from`, zones and `trapped`.

## Not in the package yet

Recognizers for pan, pinch, rotation, tap and one finger holding while
others move; Patterns for swiping a row's actions.

The Gesture Lab in `apps/pwa-playground` (`/gestures`) shows each rule
above as a Case you can touch, with every finger drawn and a log of who
heard what.
