# @kstackz/use-gesture

Touch gestures: a platform-free core that reads every finger of a touch from any touch source. Its web side is in @kstackz/web-toolkit's input, its native side in @kstackz/expo-toolkit's.

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
Walk a picker moves through.

The platforms build on it. `@kstackz/web-toolkit/input` is the browser's
touch source and React bindings: a `GestureProvider`, `GestureZone`s that are
DOM elements, `useGesture` with every finger as Motion values, the `useSwipe`
Recognizer, and the `useSidebar` and `usePullToRefresh` Patterns.
`@kstackz/expo-toolkit/input` feeds the core Gesture Handler's touches on a
phone. The web side started as ui-toolkit's gestures block and lived here as
`./web` until web-toolkit took it
([ADR 0003](../../docs/adr/0003-web-toolkit-and-the-gate.md)).

The language is in [CONTEXT.md](./CONTEXT.md), and the decisions that shaped
it are in [docs/adr/](./docs/adr/). They are numbered from 0002 because 0001
was ui-toolkit's, for its since-removed Native block. The agent guide is
[SKILL.md](./SKILL.md).

## Install

```sh
pnpm add @kstackz/use-gesture
```

No peer dependencies: the core uses no DOM, no React and no Motion.

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

## Usage

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
  `SLOP` px; web-toolkit's browser source reads it from touch events instead.
- Each change is a new, immutable Pointer: `move` hands the finger that
  moved. A platform that animates, such as the web with Motion, mirrors
  them into its own values.
