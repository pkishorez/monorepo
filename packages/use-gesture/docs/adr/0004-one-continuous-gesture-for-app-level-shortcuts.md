---
status: partly superseded by ADR-0009 (Swipe and whole-Gesture values)
---

# The Gesture Zone reads one continuous Gesture for app-level shortcuts only

The gesture block classified each touch as a Tap, Pan, Swipe or Pinch and routed it to the innermost element listening under the finger. That made the block a second, weaker element gesture system beside Motion's own, and forced a choice between panning and pinching that real hands kept landing on the wrong side of. Now the zone only serves app-level shortcuts, such as a sidebar, pull to refresh or steering something elsewhere on screen. It reads one continuous Gesture from the first finger down to the last one lifting, never classified: fingers come and go, and it reports movement, scale and rotation relative to where it started. A Swipe is a one-finger reading of it along one axis. Both reach every enabled listener anywhere in the zone, and the app's own state decides which listeners are enabled. Gestures that belong to one element stay with Motion.

Supersedes ADR 0003.

## Considered Options

- **Route each Gesture to the innermost listening element** — rejected; element gestures are Motion's job, and app-level listeners such as a hidden sidebar have no element under the finger.
- **Let the zone pick one listener when several match** — rejected; the app's state machine is the one source of truth for what is enabled, so every enabled listener fires and development warns about overlaps.
- **Commit, snap and bounds in the hooks** — rejected for now; the hooks report raw relative values, and what a Swipe or Gesture means is built on top of them.

## Consequences

- Tap, Hold and scrolling inside the zone came later: see ADR 0005.
- x and y are how far the point under the first finger moved, so scaling and rotating about the Gesture's origin keeps content under the fingers.
