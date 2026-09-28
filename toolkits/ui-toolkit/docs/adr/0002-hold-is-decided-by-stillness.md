---
status: superseded by ADR-0003
---

# A Hold is decided by stillness, not by a landing lead

A Hold used to lock when a second finger landed at least 50ms after a first one that had not moved. Fingers that landed closer together became a two-finger gesture. People plant a finger and act with the other without timing their landings, so a planted finger was often read as half of a Pinch or a two-finger Swipe. Now nothing is decided as fingers land. The first finger down becomes the Hold if it stays still while the fingers that landed after it act. It locks when one of them moves past the slop while it has moved no more than half as far, or when one of them lifts as a tap. How long before the others the first finger landed plays no part. The first finger down remains the only one that can be the Hold, so a still second finger beside a moving first one is a two-finger gesture.

## Consequences

- A Pinch needs both fingers moving. Moving one finger toward or away from the still first one is a Pan or Swipe under a Hold.
- With several fingers down, the first movement is read a frame later. Browsers can deliver one finger's move of a frame before another's, and reading it straight away would mistake a two-finger Pan for a Hold.
- The Hold locks later: at the first movement or tap of the other finger, not as it lands. A tap beside a first finger that landed under 300ms before waits until then, because the two could still make a two-finger tap.
- A finger that moves on its own before a second one lands is still a one-finger gesture, and the second finger is left out of it.
