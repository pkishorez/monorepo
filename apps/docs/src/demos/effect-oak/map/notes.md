# Map

Status: works. OpenStreetMap tiles as plain images instead of maplibre-gl;
the camera is a Node's Model.

## What was ported

Foldkit's `map`: a world map with eight featured places as markers, a
search over them, flying to a place from the list, a popup for the selected
marker, "Find me" through the browser's geolocation with a Failed state, and
pan and zoom.

```
WorldMap (root)        Model { camera, flight, selectedId, user }; Provides Flights (a Request)
                       Panned | Zoomed stop any flight; Landed is a Command sleeping the flight's length
├─ places: Places      Model { query, chosenId }; ClickedLocation → Flights.toPlace
└─ finder: Finder      Idle | Locating | Failed { reason }; Geolocation Service → Flights.toUser
world/     camera math (Web Mercator, the flight path), the places, Flights
viewport/  tiles, markers and popup for the camera at each Frame; drag and wheel
```

A flight is data: `{ from, to, at }`. The View works out the camera at each
Frame from it, as the road does with the car, so a flight replays, and each
Step shows the camera at that Message's Time.
A drag mid-flight starts from where the camera is at that Time.

## Deviations

- **The camera is in the Model.** Foldkit keeps it inside maplibre and hears
  `MovedMap` after each move. Here maplibre is gone, and the Model decides
  where the map looks: what the brief asked to show.
- **A drag is one `Panned` Message per pointer move**; the wheel is one
  `Zoomed` per event. A minute of dragging is many Messages.
- **The list's highlight is its own.** Places remembers what it asked for;
  clicking a marker selects it on the map but not in the list (roll-up 13).
- No body scroll lock or focus Command: the panel shows "Finding you…"
  inline with Cancel, and Cancel stops the lookup by replacing the Finder's
  Commands. No map bounds Message, nothing reads it.
- Tiles are OpenStreetMap's, with its attribution; there is no tile cache
  beyond the browser's.

## Blockers

- **Resolved by ADR 0006: `useFrame` could not drive a render** (roll-up
  16). The tiles change which images exist as the camera moves, so the
  Viewport must render during a flight, and `useFrame`'s callback ran after
  every render ("Maximum update depth exceeded"). Now the Viewport works the
  camera out from `frame.get()` during render, and `useMotionValueEvent`
  asks for a render only when a Frame moves the camera. Nothing re-renders
  while the camera is still.
- **A parent cannot pass data to a Child** (roll-up 13): the Places highlight.

## Testing

Foldkit's stories click places and markers and check `FlyTo`
(`Command.expectHas(FlyTo)`, `Command.resolve`), run "Find me" through
`LockBodyScroll`, `Geolocate` and `UnlockBodyScroll` both ways, and filter by
search. `mount.test.ts` mocks maplibre to check the `MountMap` stream
rebinds on remount; scenes resolve the Mount.

What Effect Oak would need:

- Named Commands (roll-up 4) for the landing and the geolocation.
- Nothing for a mount: there is no map instance. `world/camera.ts` is plain
  functions, so flight paths can be tested today, including mid-flight.
- Finder and Places with stub Flights and Geolocation: `Runtime.start` with a
  stub Layer can do it today.
- Drawing the View at a Time (roll-up 5) to check a flight's frames.

## Also surprising

- The landing Command sleeps on Effect's Clock: a flight lands live while
  Replay shows an earlier Step.
