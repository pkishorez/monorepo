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
It started as ui-toolkit's gestures block; ui-toolkit's Native block builds
its app-like navigation on it.

The language is in [CONTEXT.md](./CONTEXT.md), and the decisions that shaped
it are in [docs/adr/](./docs/adr/). They are numbered from 0002 because 0001
is the Native block's and stayed in ui-toolkit. The agent guide is
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

| Export                   | What it does                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `GestureProvider`        | Follows every finger for the zones inside it and runs one Gesture at a time.                          |
| `GestureZone`            | A `div` that marks where the app owns touch; zones nest, and `trapped` stops the walk.                |
| `useGesture`             | Reads the Gestures its nearest zone hears, as each finger's motion values.                            |
| `ZONE_GESTURE_ATTRIBUTE` | The `data-zone-gesture` attribute that turns a zone off or on for an element inside it.               |
| `useSwipe`               | The Swipe Recognizer: fingers moving one way, with live offset, velocity and whether it would Commit. |
| `useSidebar`             | A sidebar that follows a Swipe from its edge and settles open or closed.                              |
| `usePullToRefresh`       | Pull to refresh: a resisted Swipe down that refreshes when released armed.                            |

## Usage

### Swipe a row open inside a list

The whole screen is a zone, and each row is a zone inside it. A row is
trapped while its actions are open, so the screen's own gestures never hear
touches that start on it.

```tsx
<GestureProvider>
  <GestureZone className="fixed inset-0">
    {rows.map((row) => (
      <GestureZone key={row.id} trapped={row.actionsOpen}>
        <RowActions row={row} />
      </GestureZone>
    ))}
  </GestureZone>
</GestureProvider>;

function RowActions({ row }) {
  useGesture({
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
  zone around it, up to the first trapped one.
- `onEnd` sees every finger, lifted ones included, so finger count and
  distance are read once the touch is over.
- `interrupted` means the browser took the touch, for example to scroll. Treat
  it as a cancel.
- The browser still decides whether a release clicks; `preventClick()` stops
  it once the app has acted.

### Open a sidebar from the screen's edge

A sidebar Pattern returns motion values; the app renders them. The hook sits
inside the zone that covers the screen, so a Swipe from the left edge opens
it and a Swipe back anywhere closes it.

```tsx
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
