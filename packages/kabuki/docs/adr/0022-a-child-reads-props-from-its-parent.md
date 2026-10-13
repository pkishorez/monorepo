# A Child reads Props from its parent

Amends [ADR 0013](0013-a-child-owns-its-data-after-input.md): a Child still owns its Model and State after its Input, but it can now also read Props, data its direct parent works out from its own Model and State after every Update and hands down in `invoke`. The Child never writes Props, and a change to them runs none of its rules. Its Update sees them with its next Message, its Workers' Conditions read them, and its View draws them at once. Props are kept on the Child's Instance, so the View renders when they change. They are never in the Log: Replay rebuilds the parent's Model, and so the Props. They take the place of the data props a parent View used to hand a Child View, which Update and Workers never saw.

## Considered Options

- **No controlled Child; re-key it, or Provide a Capability the Child's Workers turn into Messages (until now)**: rejected. Re-keying loses the Child's data and work, and the Capability route needs a service, a Layer, a Worker and a Message for every fact.
- **Running a Child rule when its Props change**: rejected. One Message would run Updates across the tree, and their Commands would need routing. Props are facts, not events: a one-off from the parent is a new key, or a counter in Props a Worker's Condition follows.
- **The parent running the Child's own Messages (FoldKit's `inform`)**: rejected for the same reason.
- **Props worked out on read instead of kept on the Instance**: rejected. The View, Workers and Inspector would each have to reach the parent to read them.
- **Props reaching any descendant**: rejected. Only the direct parent hands Props; what reaches deep without following a Model stays a Capability.
- **Calling it Context (FoldKit's name)**: rejected. It is Effect's word for what Capabilities are built on.

## Consequences

- Every Child's entry in `invoke` is `{ input, props }`, and a keyed one adds its `key`. A fixed Child's entry used to be its Input.
- `init` still gets only the Input. A Child that copies Props into its Model holds a stale copy.
- A parent View hands a Child View only where to draw: its Handle, `ref` and `style`.
