# Transitions are what Update returns, not a declared chart

A Node's States are a Schema union, and a Transition is simply an Update that returns a different State. There is no transition table, no guards or actions language, and no entry actions: work on entering a State is that State's Lifetime. Parallel regions are a State's Children, and hierarchy is a Child inside a State, so an Effect Oak tree is a statechart built from plain functions.

## Considered Options

- **A declared machine, like XState or Foldkit's experimental Machine**: rejected. A second way to describe change would sit beside Update, and every rule would need its own small language for guards and data.
- **Entry and exit actions**: rejected. A Lifetime that finishes early does the same job and is interrupted for free when the State is left.

## Consequences

- A Node's definition shows its States and the Children of each, but not its Transitions; those live only in Update and show up in the Log.
- Staying in a State with new data never restarts its Lifetime or Children. Restarting means passing through another State.
