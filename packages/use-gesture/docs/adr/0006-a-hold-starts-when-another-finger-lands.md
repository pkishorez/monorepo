---
status: superseded by ADR-0007
---

# A Hold starts when another finger lands after a still corner finger

A finger landing in a Hold Zone used to start the Hold at once. That made the corners Hold-only: a tap there clicked nothing, a pan could not start there, and a pinch whose first finger landed there became a Hold plus a one-finger pan. With Hold Zones as wide as half the screen, too much was lost. Now the first finger down in a Hold Zone is an ordinary finger until another finger lands at least 150ms later while it is still, which starts the Hold. Its own Gesture, which has not moved, then ends as interrupted, and the new finger starts a Gesture under the Hold. Lifting first makes it a Tap, moving first makes it a Gesture, and fingers landing within 150ms of each other are a pinch. Everything else in ADR 0005 about a Hold stands.

## Considered Options

- **Start the Hold at once** (ADR 0005) — rejected; the corners gave up taps, pans and pinches.
- **Decide by which finger stays still after the second lands** (ADR 0002) — rejected; the Gesture would have to wait to be classified, and a listener takes exactly one Hold.
- **No lead time, only stillness** — rejected; the first finger of a pinch has not moved either when the second lands.

## Consequences

- Planting a finger and acting with another in under 150ms is a pinch, not a Hold. The edge glow shows whether the Hold started.
