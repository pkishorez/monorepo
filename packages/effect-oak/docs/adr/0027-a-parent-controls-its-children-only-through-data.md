# A parent controls its Children only through data

Amends [ADR 0022](0022-a-child-reads-props-from-its-parent.md). Effect Oak stays declarative, as React is: a parent says what should be, never what to do. It controls a Child in two ways only, whether it exists (its Model and State, through Invoke) and what it sees (its Props), and it never Sends to it. Whatever a parent must control, it owns: the data moves up into the parent's Model and reaches the Child as Props, as React lifts state up. Everything else a Child does, its Commands and Workers included, is its own business.

So no one has to know what is going on, only what the data says. Pause all is a flag per file in the list, and every Download's Worker follows its Props; cancel all is an empty list, and every Download stops. A reset or a retry is a new key, so a fresh Instance. A toast or a focus is a Command of the Instance that wants it.

## Considered Options

- **An Update Sending Messages to its Children, in the same Step or as entries of their own**: rejected. Replay would survive it, but a parent would have two ways to change a Child, one of them a call, and the reader of a Child could no longer tell what it does from its own Model, State and Props. A Child that must change its State because its parent says so does not own that State.
- **A Command that Sends to many Children at once, as one batch**: rejected for the same reason, and a Command's result is recorded because it cannot be redone; a call down the tree can be.
- **A channel from an Instance to its View, as XState's `emit`**: rejected. A View would need hooks, which [ADR 0001](0001-nodes-decide-what-exists.md) forbids, and a rule for what the past does with it. A toast or a focus is a Command, which is never replayed.
- **FoldKit's `inform`**: rejected in ADR 0022. FoldKit can call a Child's update because the Child's data lives inside the parent's; here a Child is an Instance of its own.

## Consequences

- A Props change still runs none of the Child's rules, so a Child cannot change its State on its parent's word: such a State lives in the parent, or the Child is started over with a new key.
- A Child's own control that its parent can override, such as pausing one file, is a Request to the parent, which owns it.
- Opening an app's Downloads owns whether each file is paused, and shows pause all and cancel all.
