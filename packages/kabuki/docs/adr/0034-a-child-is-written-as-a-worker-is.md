# A Child is written as a Worker is

Amends [ADR 0027](0027-a-parent-controls-its-children-only-through-data.md). A Worker was one entry by name: its Condition, always, `while` a test holds, or `each` key a function names, and what it runs. A Child was split in two: `children` named its slot and its kind (`Actor.many` for keyed), and `invoke`, one function for every slot of a level, said which keys exist and what each is handed. Now a Child is written as a Worker is:

```ts
children: {
  page: { actor: Task, props: ({ model }) => ({ load: model.load }) },
  dialog: { actor: Confirm, while: ({ model }) => model.confirming },
  rows: {
    actor: Row,
    each: ({ model }) => model.ids,
    input: (_, id) => ({ text: id }),
    props: ({ model }, id) => ({ selected: id === model.selected }),
  },
},
```

`invoke` and `Actor.many` are gone. A Child written with `while` is new: it exists while its test holds, and comes back as a fresh Instance, with the next ID, as a key Invoked again does. Each Child is checked against the Actor written in it, and its parent's View types it by its Condition: a Child always there is a Handle, a `while` Child is a Handle or `undefined`, an `each` Child is a list.

## Considered Options

- **`invoke` beside `children`, as it was**: rejected. One way to write work and another to write Children, and a Child that exists only while a test holds needed a State of its own.
- **`each` naming items, `{ key, input, props }`, as `invoke` did**: rejected. It would no longer read as a Worker's `each`. A list whose Props look each key up in the Model costs a pass per key after every Update; a list long enough to feel it keeps a map in its Model.
- **Constructors, `Child.make(Task, { … })` beside `Worker.make`**: rejected while plain objects check as well. TypeScript works out each Child's Input and Props from its `actor` only if every `input` and `props` takes the same arguments, so each takes the parent's data and the Child's key, `''` unless it is one of `each`, as a Worker's `run` already does.

## Consequences

- An `each` Child is always held, as a list even when empty; a `while` Child is absent from its parent's Children while its test is false, and a Restore accepts it either way.
- An outlet's `children` is a Child per child Route, of `each` key its params give; it is spread into a level, beside the Actor's own.
