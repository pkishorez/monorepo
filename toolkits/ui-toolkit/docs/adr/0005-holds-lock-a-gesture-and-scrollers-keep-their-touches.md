---
status: partly superseded by ADR-0006, ADR-0007, then ADR-0008 (how a Hold starts)
---

# A Hold locks the Gesture under it, and scrollable elements keep their own touches

A Hold is a finger landing in a bottom-corner Hold Zone while no finger is on the zone. How long it is pressed plays no part. Every Gesture the other fingers make falls under it, and it stays on until no finger is left, even when the Hold finger lifts first. That lets someone lift the Hold to see what is under it, or let go of it a moment before the moving finger, without the Gesture changing meaning or being cut short. A listener takes Gestures under exactly one of left, right or no Hold. So under a Hold nothing is clicked, and a finger landing in either corner does nothing until every finger has lifted.

Inside the zone, a scrollable element keeps a one-finger touch with no Hold that it can still scroll along, decided at the touch's first movement. Every other touch is the zone's. One attribute changes that for an element and what it holds: `data-zone-gesture="enabled"` gives the zone even the touches a scroller would keep, and `disabled` means the zone never takes a touch there. The nearest one decides.

## Considered Options

- **A Hold that must stay still for a while** (ADR 0002) — rejected; a quick press followed by an action failed, and the delayed highlight felt slow. Apps leave the corners free instead.
- **Ending the Gesture when the Hold finger lifts** — rejected; people often release the Hold a moment before the moving finger, which would have cancelled their Swipe.
- **Capturing every touch until an element opts out** — rejected; lists inside the zone should scroll with no setup.

## Consequences

- The zone lets the browser pan (`touch-action: pan-x pan-y`) and cancels the first touch movement of every touch it takes, so it must listen to `touchmove` without `passive`.
- A touch the browser keeps ends the Gesture it started as interrupted, and the zone takes nothing until every finger lifts.
