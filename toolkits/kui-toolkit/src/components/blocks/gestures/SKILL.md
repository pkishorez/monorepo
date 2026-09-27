---
name: kui-gestures
description: Add touch gestures (tap, double tap, Pan, Swipe, Pinch, each with or without a held finger) with kui's gestures block, animated through motion values. Use when making a page or surface respond to gestures, choosing which gesture triggers an action, building a pull to refresh, swipeable row, sidebar, photo viewer or map, or when a gesture misfires, fights scrolling, or breaks browser back.
---

# kui-gestures

`kui-toolkit/components/blocks/gestures`: hooks that turn touches in a
Gesture Zone into motion values, one XState machine that classifies every
touch, a finger layer and a debug overlay. The live demo is the Gesture Lab,
`apps/pwa-playground/src/routes/-gestures/`.

```tsx
<GestureProvider scroll="none" className="h-dvh">
  <GestureZone scroll="y" className="overflow-y-auto">
    <Feed /> {/* calls useSwipe, useTap… */}
  </GestureZone>
  <GestureFingers />
  {debug ? <GestureDebugOverlay machineClassName="…" /> : null}
</GestureProvider>
```

## The model

Every gesture is **gesture** × **fingers** × **Hold**:

- gesture: `tap` (`count` 1 or 2), **Pan**, **Swipe** (up, down, left or
  right), **Pinch** (always two fingers).
- fingers: 1 or 2 acting fingers, not counting the Hold.
- Hold: none, left or right. A **Hold** is a finger kept still while the
  others act, like a held Shift key: every gesture of the other fingers
  happens with it, until it lifts. Its side is where it sits relative to
  them.

Classification is the same in every app. What you register only changes
how long a tap waits and whether a movement is a Pan or a Swipe.

1. **Nothing is decided when fingers land.** The first finger to pass 10px
   decides. One finger down: a one-finger gesture. More: the finger down
   longest locks as the Hold only if it landed at least 50ms before the
   others and stayed within 5px; the rest act (up to 3 fingers in all).
   Fingers landing within 50ms stay together: they Pinch if their distance
   changes more than they travel together, else make a two-finger Pan or
   Swipe. Anything else is ignored until every finger lifts.
2. **Locked until lift.** A gesture stays what it was classified as until
   one of its fingers lifts. A Hold stays until it lifts; the other fingers
   can make any number of gestures meanwhile, each classified afresh. The
   Hold drifting more than 24px cancels it and what it modifies.
3. **Taps.** Fingers that land and lift within 300ms without passing the
   slop. Two fingers tap together when both lift within 300ms of the first
   landing. One finger lifting quickly while another stays: the staying one
   is the Hold at once if it has been down 300ms already, else wait for it
   to lift (a two-finger tap) or for the 300ms to run out (it is the Hold,
   and the tap was made with it). A single tap waits for a double tap only
   when a `count: 2` tap is registered for the same fingers and Hold;
   otherwise it fires on lift.
4. **A Swipe claims its own directions; a Pan gets the rest.** The first
   movement's main direction decides: a Swipe registered that way (or, for
   a `stay` Swipe resting open, the way back) takes it, else a Pan for the
   combination does. Either stays that kind until lift. So one finger can
   page photos sideways with a Pan and dismiss with a Swipe down.
5. **Scroll axis.** `scroll` (`y` by default, `x`, or `none`) is the axis
   the browser keeps for one finger with no Hold: a first movement along it
   scrolls natively, except a registered Swipe the way the scroller cannot
   go (at the top, finger moving down). That is pull to refresh on a
   scrolling feed. Pans never get that exception.
6. **Capture.** Once a gesture is claimed, a Hold locked, or a second finger
   down, the zone holds the page still until every finger lifts. A two-finger
   drag never scrolls the page.
7. **Release velocity** comes from the gesture's own fingers, over their
   last 60ms: held still that long before lifting reads 0, so nothing flings.

A combination nobody registered does nothing; two fingers are still
Captured.

## Hooks

Every hook takes `fingers` (1 or 2, default 1; not on Pinch), `hold`
(`'none'` default, `'left'`, `'right'`, `'any'` for either side) and
`enabled` (default true). Hooks register with the nearest zone on mount
and throw outside one. Options are read at gesture time, so changing them
re-registers nothing; only the key (gesture, fingers, Hold, direction,
count) does. React never renders during a gesture.

```ts
useTap({ count: 2, fingers: 2, hold: 'left', onTap: ({ point, hold }) => {} });

const { x, y } = usePan({ fingers, hold, x?, y?, axis?: 'x' | 'y',
  bounds?: { left, right, top, bottom } | (() => bounds),
  momentum?: true, snap?: number, onStart?, onEnd? });

const { progress, armed, source, available, open, close } = useSwipe({
  direction: 'down', distance: 72, edge?: false,
  after?: 'return' | 'stay', settle?: true, progress?,
  onSwipe?: () => refresh(), onCancel?,
});

const { scale, originX, originY } = usePinch({ hold, scale?, min?: 1,
  max?: 4, x?, y?, onStart?, onEnd? });

const hold = useHold(); // { side, point } | undefined, renders on lock/release only
```

- **Pan**: `x`/`y` follow the fingers from where they were, rubber-band past
  `bounds` and spring back; on release they coast with the fingers' speed
  (`momentum`), resting on a multiple of `snap`. Pass your own values to
  share them; `bounds` as a function follows a zoom.
- **Swipe**: `progress` is travel over `distance`: 0 at rest, 1 committed,
  clamped at 0, rubber-banded past 1, following the finger however slowly.
  Release commits at 40% or past or on a forward flick of 0.3px/ms; a
  backward flick always cancels. `armed`
  is 1 while releasing now would commit: show "Release to refresh" off it.
  It springs to 1 and runs `onSwipe`, or back to 0 and runs `onCancel`,
  carrying the finger's speed. `after: 'return'` holds at 1 until
  `onSwipe`'s promise settles, then springs home; `after: 'stay'` stays at
  1 until a Swipe the opposite way drags it back. `open()` commits as if
  swiped (it runs `onSwipe`); `close()` springs to 0. `settle: false`
  leaves the animation after release to you.
- **Pinch**: `scale` is the start scale times the fingers' distance over
  the one they landed at, rubber-banded past `min`/`max` and springing back.
  Given a Pan's `x`/`y` it moves them too, so the point under the fingers
  stays there: put the transformed element at the zone's top left with
  `originX: 0, originY: 0`. Without them, `originX`/`originY` (px from the
  zone's top left) are where the fingers landed.

A one-finger no-Hold Pan along the zone's `scroll` axis, and an edge
Swipe that is not one finger sideways, throw in development. A Pan with no
`axis` sharing a combination with a Swipe only warns, since the Swipe
takes its directions from it; a Pan with an `axis` beside a Swipe is fine.
Several hooks on the same key all fire; several Swipe directions on one
combination are fine.

## Zones and bubbling

`GestureProvider` is the app's root zone; `GestureZone` is a region inside
it with its own `scroll`. They are one implementation. Zones nest: a touch
belongs to the innermost zone it starts in, which classifies it by its own
`scroll`. The gesture goes to the innermost zone, walking outward, with a
hook for its key (gesture, fingers, Hold, and direction for a Swipe), and
the tap wait and Pan-or-Swipe decisions read the whole chain the same way.
In each zone a Swipe claims its directions before a Pan (rule 4); a zone
with neither for the movement passes it out. So a closed row's Swipe right
passes out to the sidebar around it, while a map's Pan inside the sidebar's
zone wins over the sidebar. One exception: an open `after: 'stay'` Swipe (a drawer) claims its way
back before any zone inside it, outermost first, since it sits on top of
them. Swiping left with the sidebar open closes it rather than opening a
right-hand panel inside.

**Put a zone on the scrolling element itself, or inside it.** Touch-action
is read up to the nearest scroller, so a zone around a scroller cannot
leave its scrolling to the browser. The browser's own pull to refresh and
overscroll stay out (`overscroll-behavior: contain`).

Inside a zone, text fields and native sideways scrollers (a carousel row with
`overflow-x: auto`) keep their own touch handling. Buttons, links and other
semantic controls keep a stationary tap as their native click, while a drag
starting on them may still become a gesture. Long-press callouts and text
selection are off. A finger lifting from a Captured touch does not also click
what is under it.

## Edges

`edge: true` on a sideways Swipe starts it at the edge opposite its
direction: a Swipe right from the left edge. Top and bottom edges are never
offered. Who owns the edges depends on the Environment:

| Environment               | Edges owned by | The edge Swipe                                   |
| ------------------------- | -------------- | ------------------------------------------------ |
| iOS installed             | app            | starts only in the 24px strip (`source: 'edge'`) |
| iOS Safari tab, desktop   | browser        | starts anywhere in the zone (`source: 'zone'`)   |
| Android, tab or installed | OS (32px)      | starts anywhere in the zone (`source: 'zone'`)   |

Strips the browser or OS own are never listened in, and nothing but edge
Swipes starts in a strip the app owns. The fallback from anywhere never
beats an inner zone: any zone inside that wants the movement (its own Pan,
or a Swipe that way) gets it first, so a map's or a photo viewer's sideways
drag never opens the sidebar. The fallback only fires where nothing inside
wants the movement. It is off, with a development warning and
`available: false`, when another hook in its own zone or one around it
already takes that Swipe: show a button instead.

## Animating with motion values

The hooks set motion values; `<motion.div style={{ x, y, scale }}>` does
the DOM writes. Derive everything else with `useTransform`:

```tsx
const sidebar = useSwipe({
  direction: 'right',
  edge: true,
  after: 'stay',
  distance: 288,
  spring: { stiffness: 600, damping: 50, mass: 1 }, // optional
});
const x = useTransform(sidebar.progress, [0, 1], [-288, 0]);
const scrim = useTransform(sidebar.progress, [0, 1], [0, 0.5]);
```

The finger sets the value each move; release hands it to a spring
(`settle`) or inertia (`coast`) starting at the finger's speed; a touch
landing mid-animation catches it (`value.stop()`), and if that touch makes
no gesture for the hook it carries on where it was going. `settle(value,
to, { velocity, spring })` and `coast(value, { velocity, min, max, snap })`
are exported for your own animations (a double tap zoom). A Swipe accepts
the same optional `spring`; otherwise it uses `DEFAULT_GESTURE_SPRING`.
Reduced motion is read as each animation starts and jumps instead.

## Choosing gestures

- Map actions to commitment: tap to touch one thing, double tap to zoom or
  reset, Swipe to commit a step (open, refresh, dismiss), Pan to move
  freely, Pinch to scale.
- Keep one finger along the scroll axis for scrolling; use Swipes at the
  scroller's ends, or a Hold or two fingers, for anything else there.
- Give left and right Holds clearly different modes and show the active one
  (`useHold`).
- Give every gesture a visible control too; gestures are shortcuts.

## Showing fingers

`<GestureFingers />` anywhere inside the provider draws every finger under
it by role: a soft ring while undecided, a bubble growing inside after
120ms of rest; the Hold popping as it locks, then glowing with a "Left Hold"
/ "Right Hold" chip; a comet tail behind a moving finger; a burst for each
tap. Set `tapFeedback={false}` to hide only that tap burst, or `enabled={false}`
to hide the whole visualization without changing gesture input. Reduced motion
keeps it still. Colours are `--gf-*` properties set from kui tokens.

## Testing

- **Debug overlay.** `<GestureDebugOverlay />` outlines every zone with its
  scroll rule, labels the edge strips with their owner, hatches native
  scrollers, numbers each finger, shows the Environment in one line
  (`gesture-overlay-environment`) and draws the machine of the zone touched
  last (`gesture-overlay-machine`, `data-state` is the state value as JSON).
  Place it with `machineClassName` (fixed) where it covers nothing you touch.
- **The machine.** `engine/machine.ts` is the whole model: `idle`,
  `pressing` (`down`, `waiting`), `moving`, `tapped`, `native`, `ignoring`,
  and `held` with `idle`, `pressing`, `moving`, `tapped` and `ignoring`
  inside. It touches no DOM and reads registrations through the `Policy`
  its engine is given. Change behaviour there, not in the zone.
- **Unit tests.** `engine/engine.test.ts` feeds pointer samples to an engine
  on xstate's `SimulatedClock` with a fake policy; `registry/registry.test.ts`
  checks the chain and development checks; `motion/motion.test.ts` runs
  motion on fake timers installed before it loads (`vi.hoisted`).
- **Browser automation.** Emulate a phone with touch and drive fingers with
  CDP `Input.dispatchTouchEvent`. `touchEnd` releases the points it lists,
  so lift one finger of two with a `touchEnd` listing only that one. Check
  Capture by the zone's `touchmove` events being `defaultPrevented`, not by
  scroll position.
