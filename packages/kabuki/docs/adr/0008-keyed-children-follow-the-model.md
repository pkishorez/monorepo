# Keyed Children follow the Model within a State

Supersedes the part of [ADR 0002](0002-transitions-are-what-update-returns.md) that says staying in a State never changes its Children.

A State can Invoke a keyed Child: one Instance per key of a collection in the Model. After every Update the parent's keyed Children are matched to the Model by key: a new key Invokes a Child, a key that is gone stops its Child, and a key still there keeps its Instance. Fixed Children and the Lifetime still change only on a Transition. Which Actor a State may Invoke is fixed in the definition; only how many, and which keys, come from the Model.

## Considered Options

- **Children only per State (ADR 0002)**: rejected. A list of items with their own Commands and Lifetimes could not be built; lists were plain data inside one Model.
- **Spawning from Update or a Command**: rejected. Which Instances exist would depend on calls, not on the Snapshot, so Replay would have to log spawns as well as Messages.
