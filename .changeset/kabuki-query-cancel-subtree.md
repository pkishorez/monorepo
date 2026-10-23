---
'@kestack/kabuki': patch
---

A Query being answered by an Instance now fails as `Stopped` when any Instance above it stops, not only its own. Before, stopping the Runtime or removing an ancestor left a descendant's pending Query running, and it could still answer.
