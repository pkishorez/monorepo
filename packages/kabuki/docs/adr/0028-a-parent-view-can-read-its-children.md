# A parent View can read its Children

Amends [ADR 0001](0001-nodes-decide-what-exists.md) and [ADR 0015](0015-a-view-is-one-function-of-its-instance.md). A parent View sometimes has to show what its Children are doing: "2 of 4 done", or no Pause all once every file is finished. Its logic never needs that, because a parent controls its Children through data ([ADR 0027](0027-a-parent-controls-its-children-only-through-data.md)), so this is for drawing only. Two hooks read it: `useChild` for a fixed Child and `useChildren` for a slot of keyed ones. Each gives what the Child's own View draws from, its Model, State and Props, but not its Children and nothing to Send with: a parent View can read a Child, never act on it, and only one level down. Only the component that calls the hook re-renders when a Child changes, never the parent View on its own; given an optional selector, it re-renders only when what the selector picks changes, so a count of finished files ignores every tick of progress. It is an escape hatch: what a parent must act on, it owns.

ADR 0001 forbade hooks in Views because a hook can hold state and start work, which would tie the app to React. These hooks do neither: they read the Snapshot drawn, as a View does, so Time Travel shows each Child at the Step picked and a server draws the saved one. Views may read the drawn app through Kabuki's hooks; never React state or effects.

## Considered Options

- **Each Child's Handle carries its State**: rejected. Every parent View would re-render on every Child's change, read or not.
- **A selector given to `View.make`**: rejected. One more option to learn, and the whole View re-renders where a hook re-renders only the component that reads. The selector is the hook's optional second argument instead.
- **The Child's `send` in what is read**: rejected. A loop in the parent View Sending to each Child is ADR 0027's rejected call down the tree, moved into the View, and N entries in the History instead of one.
- **The Child's Children in what is read**: rejected. Their Handles would reach any depth.
- **State only, the Model private**: rejected. Reading changes nothing, so there is nothing to protect, and a component that reads the Model asked for its re-renders.
- **A Child reporting up through a function in its Props**: rejected. Props are data kept in the Snapshot, which is saved; a Request already tells a parent what its logic needs.
- **Renaming Props to Context, FoldKit's name**: rejected again, as in [ADR 0022](0022-a-child-reads-props-from-its-parent.md). Context is Effect's word for what Capabilities are built on, and in React it reaches every descendant, while Props, like ours, come from the direct parent.

## Consequences

- `@kstackz/kabuki/react` exports `useChild` and `useChildren`; outside an app they throw.
- A Child that has stopped reads as `undefined`, and `useChildren` leaves it out.
- Opening an app counts finished Downloads and offers Pause all only over unfinished ones.
