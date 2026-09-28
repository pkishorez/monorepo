# A Hold is a still finger beside an acting one, decided by one state machine

A Hold could only start in a corner Hold Zone, and only when a second finger landed at least 150ms after a still corner finger (ADR 0006). The hidden timer and the corner made it hard to trigger, and its glow looked unreliable because it only reported that. Now a finger anywhere becomes the Hold when another finger acts beside it, moving 8px or tapping, while it has moved under 4px. It is the left Hold when it rests left of the acting finger and the right Hold when right of it. Two fingers that both move are a pinch. A zone turns Holds on with `holds`; without them, two fingers are always a pinch.

The phases are now one XState machine: idle, pressing, moving, deciding, held (acting or waiting) and multi. Before, several readings kept their own state and each depended on the others. The machine only decides the phases and the Hold. The Gesture and Swipe maths stay as pure readings it drives, and the glow is on exactly while the machine is in held.

Supersedes ADR 0006 and the part of ADR 0005 on how a Hold starts; the rest of ADR 0005 stands.

## Considered Options

- **Keep corner Hold Zones with a lead time** (ADR 0006): rejected, because the corners and the 150ms timer made the Hold fail silently.
- **Decide by stillness after a movement**, the way ADR 0002 did: taken, but with a fixed side rule (relative position) and no reclassification once decided.
- **Keep hand-written readings**: rejected. The phases depended on each other (the Hold decided which touches the zone captures), and one explicit machine makes every transition visible and testable.

## Consequences

- A pinch where one finger stays almost still (under 4px while the other moves 8px) becomes a Hold. Apps that do not want Holds leave them off.
- The Gesture with no Hold that started with the first finger ends as interrupted when the Hold locks, and a Gesture under the Hold begins from where the acting finger landed, so the Swipe loses none of its way.
- `holdRadius` is gone. The zone sets `data-state` to the machine's state for debugging.
