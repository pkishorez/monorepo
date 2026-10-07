# @kstackz/use-gesture

Touch gestures: a platform-free core that reads every finger of a touch from any touch source, and React bindings for the web, with every finger as motion values in nested zones that own touch.

## Big picture

An app that wants a sidebar you swipe open, a list you pull to refresh, or
a row you swipe for actions has to take touches away from the platform
without breaking scrolling, clicks, or the other gestures on the same
screen. This package does that part once. A Gesture Provider follows every
finger, and Gesture Zones mark the areas where the app owns touch.

The package root is the **core**, and it is platform-free: no DOM, no React,
no Motion. A touch source on any platform feeds `createGestureProvider`
plain finger samples (`{ id, x, y, t, target }`) and tells it how its zones
nest; the core decides which zones hear a Gesture and which one takes it,
reads its Direction, and holds the rules a Swipe is judged by and the Tree
Walk a picker moves through. `./web` builds on it the way any other
platform would; the Expo Toolkit feeds it Gesture Handler's touches.

`./web` is the browser's touch source and React bindings: a
`GestureProvider`, `GestureZone`s that are DOM elements, and `useGesture`,
which hands over each finger of a touch, including lifted ones, as motion
values. Above it, Recognizers such as `useSwipe` read one generic meaning
with live feedback, and Patterns such as `useSidebar` and `usePullToRefresh`
are whole touch behaviours an app uses as they are. It started as
ui-toolkit's gestures block.

The language is in [CONTEXT.md](./CONTEXT.md), and the decisions that shaped
it are in [docs/adr/](./docs/adr/). They are numbered from 0002 because 0001
was ui-toolkit's, for its since-removed Native block. The agent guide is
[SKILL.md](./SKILL.md).

## Install

```sh
pnpm add @kstackz/use-gesture
# for ./web
pnpm add motion react react-dom
```

Every peer is optional: the core needs none of them.

- `motion` (`./web`): every finger's position is a Motion value, so movement
  never re-renders React, and velocity comes with it.
- `react`, `react-dom` (`./web`): the provider, zones and hooks are React
  components and hooks.

## Exports

### `@kstackz/use-gesture`

| Export                  | What it does                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `createGestureProvider` | A Gesture Provider for any platform: a touch source feeds its `sink` fingers, and listeners on its zones hear them. |
| `directionOf`           | The Direction of a movement: whichever of up, down, left and right it went most.                                    |
| `wants`                 | Whether a listener's Directions take a touch going one way.                                                         |
| `SLOP`                  | How far, in px, a finger goes before its Direction is read when the source does not read it first.                  |
| `Swipe.along`           | How far a movement went toward a Direction.                                                                         |
| `Swipe.movement`        | How the fingers still down moved on average.                                                                        |
| `Swipe.fingersMatch`    | Whether a finger count is what a Swipe asks.                                                                        |
| `Swipe.startsFrom`      | Whether a finger landed where a Swipe from an edge asks.                                                            |
| `Swipe.commits`         | Whether a Swipe's offset or velocity meets its rule to Commit.                                                      |
| `Swipe.release`         | Where a Swipe was as it let go, and where its momentum would carry it.                                              |
| `Swipe.createVelocity`  | Velocity over the last 100ms, falling to 0 while the fingers rest.                                                  |
| `Swipe.DEFAULT_COMMIT`  | What a Swipe needs to Commit unless told otherwise: 80px or 500px/s.                                                |
| `thumbLock`             | The Thumb Lock as a listener: a still left thumb beside a moving finger, telling the Lock, each move and the end.   |
| `TreeWalk.begin`        | A walk through a tree of choices, starting on the one named.                                                        |
| `TreeWalk.move`         | The walk after the finger moves: Steps, opening a choice, going back, or a Wrong Way.                               |
| `TreeWalk.chosen`       | The choice letting go chooses, unless it is where the swipe began.                                                  |
| `TreeWalk.columns`      | Each list the walk has opened, with what is marked in it: what a picker shows.                                      |
| `TreeWalk.lists`        | Every list a walk can open, with the ids `columns` gives them: what a picker draws up front.                        |
| `TreeWalk.choiceAt`     | The choice a path of indices ends on.                                                                               |
| `TreeWalk.opens`        | Whether a choice has choices inside it.                                                                             |
| `TreeWalk.DISTANCES`    | How far the finger goes to show the walk and for each move: 14px and 30px.                                          |

The provider, the Direction functions, `thumbLock` and the Tree Walk are
worklets (each starts with the `'worklet'` directive, a plain string
elsewhere), so a phone can run them on Reanimated's UI thread.

### `@kstackz/use-gesture/web`

| Export             | What it does                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `GestureProvider`  | Follows every finger for the zones inside it and runs one Gesture at a time. Nested, it does nothing. |
| `GestureZone`      | A `div` that marks where the app can own touch; zones nest, and `trapped` keeps its Gestures in.      |
| `useGesture`       | Reads the Gestures its nearest zone hears, as each finger's motion values.                            |
| `useSwipe`         | The Swipe Recognizer: fingers moving one way, with live offset, velocity and whether it would Commit. |
| `useSidebar`       | A sidebar that follows a Swipe from anywhere, or only its edge, and settles open or closed.           |
| `usePullToRefresh` | Pull to refresh: a resisted Swipe down that refreshes when released armed.                            |

## Usage

### Swipe a row open inside a list

The whole screen is a zone, and each row is a zone inside it. A shut row
wants left and right, an open one only right, so up and down still scroll
and a swipe left on an open row reaches the screen's own gestures.

```tsx
import {
  GestureProvider,
  GestureZone,
  useGesture,
} from '@kstackz/use-gesture/web';

<GestureProvider>
  <GestureZone className="fixed inset-0">
    {rows.map((row) => (
      <GestureZone key={row.id}>
        <RowActions row={row} />
      </GestureZone>
    ))}
  </GestureZone>
</GestureProvider>;

function RowActions({ row }) {
  useGesture({
    directions: row.actionsOpen ? ['right'] : ['left', 'right'],
    onEnd: (pointers, { interrupted, preventClick }) => {
      const [first] = pointers.values();
      if (interrupted || pointers.size !== 1 || first === undefined) return;
      const dx = first.dx.get();
      if (dx < -60) row.open();
      if (dx > 60) row.close();
      if (Math.abs(dx) > 60) preventClick();
    },
  });
  // ...
}
```

- The first finger decides who hears the Gesture: the row's zone, then each
  zone around it, up to the first trapped one. At the first movement the
  innermost zone that wants its Direction takes it; with none, the browser
  scrolls.
- `onEnd` sees every finger, lifted ones included, so finger count and
  distance are read once the touch is over.
- `interrupted` means the browser took the touch, for example to scroll. Treat
  it as a cancel.
- The browser still decides whether a release clicks; `preventClick()` stops
  it once the app has acted.

### Open a sidebar with a swipe

A sidebar Pattern returns motion values; the app renders them. The hook sits
inside the zone that covers the screen, so a Swipe right anywhere opens it and
a Swipe back anywhere closes it. `edge: 24` would open it only from the left
edge instead: it then captures touches landing there and leaves the rest of
the screen to the browser. Open or closed, the left edge is the sidebar's, so
a swipe from it never goes back a page, and a one-finger swipe from it always
moves the sidebar, even over a zone inside that wants a Swipe right.

```tsx
import { useSidebar } from '@kstackz/use-gesture/web';

function Shell({ children }) {
  const [open, setOpen] = useState(false);
  const sidebar = useSidebar({
    side: 'left',
    width: 280,
    open,
    onOpenChange: setOpen,
  });
  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        className="fixed inset-y-0 left-0 w-[280px]"
        style={{ x: sidebar.x }}
      />
      {children}
    </>
  );
}
```

- Two Swipes run inside it: one enabled while closed, one while open.
- It settles by the release's `projected` position, so a quick flick opens
  it from a few px.
- `x` animates from the fingers' own velocity, and `setOpen` animates it too.

### Feed the core from another touch source

A platform other than the browser hands the core its own fingers. Here a
plain tree stands in for a phone's views; on Expo, Gesture Handler's
touches arrive the same way, with a view as each finger's `target`.

```ts
import { createGestureProvider, type ZoneTree } from '@kstackz/use-gesture';

type View = { parent: View | null; zone: boolean; trapped: boolean };
const zoneOf = (view: View | null): View | null =>
  view === null ? null : view.zone ? view : zoneOf(view.parent);
const views: ZoneTree<View, View | null> = {
  zoneOf,
  parentOf: (zone) => zoneOf(zone.parent),
  trapped: (zone) => zone.trapped,
};

const provider = createGestureProvider(views);
const screen: View = { parent: null, zone: true, trapped: false };
provider.addZone(screen);
provider.addGesture(screen, {
  enabled: () => true,
  directions: () => ['right'],
  start: () => {},
  pointer: () => {},
  move: (finger) => console.log(finger.dx),
  direction: (way) => console.log('locked', way),
  end: (_fingers, { interrupted }) => console.log({ interrupted }),
});

provider.sink.down({ id: 1, x: 0, y: 0, t: 0, target: screen });
provider.sink.move({ id: 1, x: 12, y: 1, t: 16, target: screen });
provider.sink.up({ id: 1, x: 40, y: 2, t: 90, target: screen });
```

- The source calls `down`, `move` and `up`, and `cancelAll(t)` when the
  platform takes the touch. Times are on the source's own clock.
- With no `undecided` moves, the Direction is read once a finger has gone
  `SLOP` px; the browser's source reads it from touch events instead.
- Each change is a new, immutable Pointer: `move` hands the finger that
  moved. A platform that animates, such as the web with Motion, mirrors
  them into its own values.
