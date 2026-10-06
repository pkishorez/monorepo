# @kstackz/use-gesture

Touch gestures for React: every finger of a touch as motion values, in nested zones that own touch.

## Big picture

A web app that wants a sidebar you swipe open, a list you pull to refresh, or
a row you swipe for actions has to take touches away from the browser without
breaking scrolling, clicks, or the other gestures on the same screen. This
package does that part once. A `GestureProvider` follows every finger, and
`GestureZone`s mark the areas where the app owns touch. `useGesture` hands
over each finger of a touch, including lifted ones, as motion values.

The core never decides what a touch means. Two layers above it do:
Recognizers such as `useSwipe` read one generic meaning with live feedback,
and Patterns such as `useSidebar` and `usePullToRefresh` are whole touch
behaviours an app uses as they are. Each layer depends only on the one below.
The Patterns come from the package root with the provider and zone;
Recognizers and Core have their own entry points.
It started as ui-toolkit's gestures block.

The language is in [CONTEXT.md](./CONTEXT.md), and the decisions that shaped
it are in [docs/adr/](./docs/adr/). They are numbered from 0002 because 0001
was ui-toolkit's, for its since-removed Native block. The agent guide is
[SKILL.md](./SKILL.md).

## Install

```sh
pnpm add @kstackz/use-gesture motion react react-dom
```

- `motion`: every finger's position is a Motion value, so movement never
  re-renders React, and velocity comes with it.
- `react`, `react-dom`: the provider, zones and hook are React components and
  hooks.

## Exports

### `@kstackz/use-gesture`

| Export             | What it does                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `GestureProvider`  | Follows every finger for the zones inside it and runs one Gesture at a time. Nested, it does nothing. |
| `GestureZone`      | A `div` that marks where the app can own touch; zones nest, and `trapped` keeps its Gestures in.      |
| `useSidebar`       | A sidebar that follows a Swipe from anywhere, or only its edge, and settles open or closed.           |
| `usePullToRefresh` | Pull to refresh: a resisted Swipe down that refreshes when released armed.                            |

### `@kstackz/use-gesture/recognizers`

| Export     | What it does                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `useSwipe` | The Swipe Recognizer: fingers moving one way, with live offset, velocity and whether it would Commit. |

### `@kstackz/use-gesture/core`

| Export       | What it does                                                               |
| ------------ | -------------------------------------------------------------------------- |
| `useGesture` | Reads the Gestures its nearest zone hears, as each finger's motion values. |

## Usage

### Swipe a row open inside a list

The whole screen is a zone, and each row is a zone inside it. A shut row
wants left and right, an open one only right, so up and down still scroll
and a swipe left on an open row reaches the screen's own gestures.

```tsx
import { GestureProvider, GestureZone } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';

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
import { useSidebar } from '@kstackz/use-gesture';

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
