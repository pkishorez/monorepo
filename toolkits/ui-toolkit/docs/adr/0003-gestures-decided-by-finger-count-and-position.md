---
status: superseded by ADR-0004
---

# Gestures are decided by finger count and position, not by inference

The gesture engine classified touches by inferring intent: whether two fingers were pinching or panning together, whether a still first finger was a Hold, whether a movement was a Pan or a Swipe. Each inference needed tie-break rules, and real hands kept landing on the wrong side of them. Now nothing is inferred. One finger lifts as a Tap or moves as a Pan; two fingers moving are always a Pinch that reports movement, scale and rotation together, as on iOS and Android; and a finger is a Hold only when it lands in a Hold Zone in a bottom corner of the one Gesture Zone. Swipe is not a separate classification but a hook's reading of a Pan in one direction. The gestures are meant as keyboard-like shortcuts on a phone, not as a rich manipulation system, so a small unambiguous set beats a large expressive one.

Supersedes ADR 0002.

## Considered Options

- **Tune the inference thresholds** — rejected; any threshold between pinching and panning, or between still and moving, misreads the hands near it.
- **Let a zone register either two-finger Pan or Pinch** — rejected; the platforms users know combine them, so splitting them surprises users even when it removes the engine's ambiguity.
- **Nested Gesture Zones** — rejected for one zone per screen with element-attached listeners that bubble outward, so there is one place a Hold can be made.

## Consequences

- Two-finger Swipe, two-finger Tap and edge Swipes are gone, and Edge Ownership with them: where the Gesture Zone sits over an edge the browser or OS owns is the app's problem.
- Inside the Gesture Zone every touch is the app's. Elements that can scroll are detected as Native Scrolls and keep one-finger scrolling along their axis, except toward an end they already sit at, where a listening Swipe takes the touch (pull to refresh, and its three siblings). The browser decides at the first movement, so a scroll that reaches its end mid-touch cannot be handed over.
- A Tap with no Hold still clicks the element under it; a Tap under a Hold does not.
