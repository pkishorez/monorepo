# Behavior is written in Levels, and needs bubble up

Supersedes the per-State maps of `update`, `children`, `provides` and `invoke`, and the `in` Worker, and the part of [ADR 0014](0014-provides-is-a-layer-built-per-state.md) that says Provides is only per State.

`Actor.make` takes only Schemas and Requires: `requires`, `input`, `model`, `message`, `state`. `build` takes the behavior at two Levels: the top, for as long as the Instance lives, and one block per State, for as long as that State lasts. Each Level can hold `provides`, `children`, `invoke`, `on` (the Updates) and `workers`. A Child written at the top lasts through every Transition; a Worker written in a block is owned by that State.

Requires caps the Actor's own code: its Workers, Commands and Provides can reach nothing else. It says nothing about the Children. A Child's needs bubble up: what a Level does not Provide where the Child is placed is added to what the Actor needs from above, until an ancestor Provides it or the app's Layer must. `toReact` names what is still missing.

## Considered Options

- **Every per-State part as its own map keyed by State tag (until now)**: rejected. One State was spread over four maps that repeated every tag, and a Child that lasts through Transitions could not be written.
- **State data written inside `build`, beside the behavior**: rejected. An Update returns the next State, so the whole State union must exist before any rule is typed.
- **Provides declared in `make` as lists of Capabilities**: rejected. The Layer each builder returns already names them.
- **A Child's needs passing through only if the parent Requires them (until now)**: rejected. Every Actor on the way down had to name Capabilities its own code never used.
- **No Requires at all, inferred from what the code uses**: rejected. A Capability an Actor should not touch would compile without a word; a written cap is checked at the line that breaks it.

## Consequences

- Placing a Child never fails by itself. An unmet need fails at `Runtime.start` or `toReact`, not at the line that placed the Child.
- The State tags are written twice: once as data in `make`, once as blocks in `build`.
- A Worker's name is used once per Actor, and a Child written at the top shares its name with no State's.
