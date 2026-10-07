---
name: use-gesture
description: Add touch gestures on the web with @kstackz/web-platform/input, built on @kstackz/use-gesture's core — a GestureProvider at the root, nested GestureZones for the areas that own touch, Patterns such as useSidebar and usePullToRefresh, Recognizers such as useSwipe, and useGesture, which reports every finger of a touch as motion values. Use when a screen or element should respond to gestures such as opening a sidebar, pulling to refresh, swiping a row, pinching a card, or a multi-finger swipe; or when choosing between it and Motion's own element gestures.
---

# use-gesture

The web side of this package lives in `@kstackz/web-platform/input`: a
`GestureProvider`, `GestureZone`s that nest, and three layers of hooks that
read the Gestures their nearest zone hears. (On a phone,
`@kstackz/expo-platform/input` plays the same part.)
Reach for the highest one that fits:

1. **Patterns** — `useSidebar`, `usePullToRefresh`: one UI behaviour, done.
2. **Recognizers** — `useSwipe`: one generic meaning, with live feedback.
3. **Core** — `useGesture`: every finger, and nothing else.

All of them come from web-platform's `input`:

```ts
import {
  GestureProvider,
  GestureZone,
  useGesture,
  usePullToRefresh,
  useSidebar,
  useSwipe,
} from '@kstackz/web-platform/input';
```

The package root, `@kstackz/use-gesture`, is the platform-free core under
them: `createGestureProvider`, which any touch source feeds plain finger
samples, the `Swipe` rules and the `TreeWalk` a picker moves through. Reach
for it only to bring gestures to another platform; on the web, use
`@kstackz/web-platform/input`.

```tsx
// The whole app is a zone; the inbox list is one inside it; each row is one
// inside that. A row wants left and right while shut, only right while open,
// so a swipe left on an open row reaches the sidebar. The Motion card is
// Motion's own.
<GestureProvider>
  <GestureZone className="fixed inset-0">
    <Sidebar />
    <GestureZone>
      <PullToRefresh />
      {rows.map((row) => (
        <GestureZone key={row.id}>
          <RowActions row={row} />
        </GestureZone>
      ))}
    </GestureZone>
    <motion.div drag data-zone-gesture="disabled" />
  </GestureZone>
</GestureProvider>;

function RowActions({ row }) {
  useGesture({
    // Without directions the hook only watches: up and down still scroll.
    directions: row.actionsOpen ? ['right'] : ['left', 'right'],
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
  sections may each have their own. One inside another does nothing, so a
  component may always wrap itself in one.
- **Gesture Zone** — an area where the app can own touch. It takes a touch
  only when a listener in it wants it; the browser keeps the rest. A `div`
  that takes every div prop, so it can be the card itself. It sets only
  touch defaults, as inline style that `style` overrides: no text selection
  and no iOS callout. It sets no `position` and no `overscroll-behavior`, so
  a list at its end hands the scroll on; a full-screen app sets
  `overscroll-behavior` itself. Zones nest and sit side by side.
- **Gesture** — one continuous touch, from the first finger landing in a
  zone to the last one lifting. Every finger that lands in between,
  wherever it lands, is part of it. It is never classified: pan, pinch,
  swipe or one finger holding while another moves are meanings your app
  reads from it. A pen counts as a finger; the mouse never makes a Gesture,
  so on a desktop it selects and clicks as it would outside a zone.
- **Pointer** — one finger, or pen, of a Gesture. A lifted Pointer stays in the
  Gesture until it ends.
- **Direction** — the way a touch first moves: up, down, left or right,
  whichever it moved most. Read once, at the first movement.
- **Interrupted** — the browser took the touch (a scroll, Android's back
  gesture, an incoming call), the page lost focus, or another zone took it
  from a hook that acts. The Gesture ends at once with every finger lifted
  where it was. Treat it as a cancel.

## Who hears a Gesture, and who takes it

As the first finger lands:

1. Find the innermost zone under it.
2. That zone hears the Gesture, then the zone around it, and so on up. The
   walk stops at the first zone with `trapped`, which still hears it.
3. Every enabled `useGesture` in those zones gets `onStart`. A hook belongs
   to its nearest `GestureZone` in the React tree. Nothing is kept from the
   browser yet.

At the first movement, one zone takes it, in two passes:

1. The innermost zone with a hook whose `captures` claims where the first
   finger landed, however deep that zone sits.
2. Only if none does: the innermost zone with a hook whose `directions`
   holds the Direction.

Hooks that act (they have `directions` or `captures`) in every other zone,
around it or inside it, drop the Gesture as interrupted. Hooks that only
watch keep hearing it in every zone that heard it. If no zone takes it, the
browser scrolls and the Gesture ends as interrupted.

Later fingers join the same Gesture wherever they land. Sibling zones never
hear each other. `trapped` only hides a zone's Gestures from the zones around
it; it never keeps a touch from the browser. `trapped` and `enabled` are read
as each Gesture starts, and `directions` at the first movement, so they can
follow your app's state.

From coarse to fine, the controls are: nesting zones; `trapped` on a zone;
`enabled` and `directions` on a hook; `data-zone-gesture` on any element; and
your handlers, which check finger count, timing, or which element the first
finger landed on (`pointer.target`). When a card's swipe left and the
sidebar's swipe right both start on the card, each wants its own Direction,
and each gets only its own.

A zone rendered through a portal still reaches its provider through React,
but hears only fingers that land in it in the DOM.

## `useGesture({ enabled?, directions?, captures?, guardsEdge?, onStart?, onDirection?, onPointer?, onEnd? })`

Returns `pointers`, a `MotionValue<ReadonlyMap<number, Pointer>>` of every
finger of the Gesture under way by id, in landing order and lifted ones
included, empty between Gestures; and `active`, React state that is true
from the first finger landing until the last lifts.

| Callback                       | When                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `onStart(pointers)`            | The first finger landed                                          |
| `onDirection(direction)`       | The first movement; the same Direction for every hook            |
| `onPointer(pointer, pointers)` | A finger landed or lifted; `pointer` is that finger              |
| `onEnd(pointers, end)`         | The last finger lifted; `end` is `{ interrupted, preventClick }` |

Nothing else fires as fingers move: read that from each Pointer's motion
values.

`directions` lists the Directions the hook takes touches in:
`['left', 'right']`, or `'all'` for a drag, a pan or a hold. An element under
the finger that can still scroll that way keeps the touch instead. Without
`directions` or `captures` the hook only watches: it gets every finger until
the browser takes the touch, and never keeps it from the browser, apart
from the edge it `guardsEdge`.

`captures(point)` claims a touch whose first finger landed at `point` (viewport
px), whichever way it moves, even over an element that could scroll it, as
`data-zone-gesture="enabled"` does for an element. It is asked at the touch's
first movement, so taps are never affected. A Swipe with `from` uses it to
own its edge.

`guardsEdge: 'left' | 'right'` keeps that screen edge from the browser's edge
swipe while the hook is enabled (see Screen edges), even when it would take no
touch there. It neither captures nor wants a Direction, so it never changes
which zone takes a Gesture. `useSidebar` uses it to own its side.

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
and the last release must not click.

## Scrolling inside a zone

The browser waits for the first `touchmove` before it scrolls. There the zone
reads the Direction and decides who owns the touch, once; first match wins:

1. Two or more fingers are down: the zone's, so a pinch needs no setup.
2. The finger landed on an element marked `enabled`: the zone's.
3. A hook's `captures` claims where it landed: the zone's.
4. An element between the finger and the innermost zone can still scroll
   that way: the browser's.
5. A hook's `directions` holds the Direction: the zone's.
6. Anything else: the browser's. It scrolls whatever can scroll, the page
   included, so a list at its end hands the scroll on.

When the browser takes it, the Gesture ends as interrupted. When the zone
takes it, nothing scrolls until every finger lifts, not even under a finger
on a `disabled` element: the browser treats every finger on the screen as
one touch. With a pen that sends no touch events, the Direction is read once
it has moved 10px. `data-zone-gesture` changes the rules for an element and
what it holds; the nearest one decides:

| Value      | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `enabled`  | The zone takes every touch here, even what a scroller would keep   |
| `disabled` | The zone never takes a touch here: a slider, a map with its own UI |

A finger landing on a `disabled` element never starts a Gesture and never
joins one. Text entry is always left alone. Nothing in a zone zooms the page.

## Screen edges

A touch that lands within 24px of the left or right edge of the screen, in a
zone, is kept from the browser's own edge swipe (back and forward on iOS, in
Safari and installed) when a hook that hears it could take it there: its
`captures` claims the spot, or its `directions` holds the Direction away
from that edge (`right` at the left edge); or when a hook `guardsEdge` that
edge, as an enabled `useSidebar` does for its side, open or closed. The zone cancels that touch's
`touchstart`, the one thing iOS listens to, so a tap there does not click.
Where no hook could take it, the back swipe works. Links, buttons, form
fields, `[role=button]`, focusable elements and anything
`data-zone-gesture="disabled"` are left alone and still click, so they
still let an edge swipe go back. Android's system back gesture cannot be
stopped by a page.

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
`edge`, only within that many px of its side. With `edge` it wants no
Direction: it captures touches landing there, even over a list that scrolls
or a zone inside it that wants the same Direction, and leaves the rest of
the screen alone. While enabled it keeps its side's edge from the browser's
edge swipe, open or closed, so keep its items 24px clear of that edge or
they still let a swipe there go back. Either way, a one-finger touch that
lands within 24px of its side (or `edge` px) is always its own, even over a
zone inside it that wants the same Direction, such as swipeable tabs; a
touch of more fingers there is left to the zones. It closes from a Swipe back
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
  onStart, // Tracking: the touch's Direction is its own, with the right fingers
  onCommit, // (release) => …
  onCancel, // (reason, release?) => …
});
// swipe.offset, swipe.progress, swipe.velocity, swipe.willCommit: MotionValues
// swipe.state: 'idle' | 'possible' | 'tracking'
```

- It wants its own `direction`; with `from` it wants none and captures its
  edge instead.
- It is `possible` from the first finger landing where `from` asks. It
  locks when the engine reads the touch's Direction: another Direction
  Cancels with `direction` at once, whoever takes the touch; the wrong
  finger count Cancels with `fingers`.
- While `tracking`, `offset` follows the average of the fingers toward
  `direction` and clamps at 0 when they come back.
- It decides as the **first** finger lifts. It Commits when `offset` reaches
  `distance` or the release velocity reaches `velocity`; otherwise it Cancels
  with `short`. A finger landing after it locks Cancels with `fingers`; the
  browser or another zone taking the touch Cancels with `interrupted`.
- `willCommit` says at every moment whether letting go now would Commit.
  Velocity is measured over the last 100ms, so it falls while the fingers
  rest: a flick that stops shows it before the finger lifts.
- A flick is `commit: { velocity }` with no `distance`.
- `release` has `offset`, `velocity` and `projected`, where momentum would
  carry it, for choosing where to settle.

Recognizers never know about each other. Two in different zones that want
the same Direction never both act: the innermost zone takes it. Two in the
zone that takes it can both Commit: keep them apart with `enabled`.

## Not in the package yet

Recognizers for pan, pinch, rotation, tap and one finger holding while
others move; Patterns for swiping a row's actions.
