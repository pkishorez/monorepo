# Counters

Status: partial. It works, but each row cannot be its own Node.

## What was ported

Foldkit's `counters`: rows of counters, with Add Counter and Remove per row.

```
Counters               one Node; Model { rows: [{ id, count }], nextRowId }
└─ counter/            not a Node: a Message Schema, a pure `step`, a drawing
```

As in Foldkit, a row's Messages arrive wrapped: `GotCounterMessage { id, message }`.
The parent finds the row and steps its count with `counter/step`. This is
Foldkit's Submodel pattern (`Update.foldChild`, `h.submodel`) written by hand.

## Deviations

- Each counter is a Submodel (data plus a pure function), not a child Node, because of the blocker below.
- Buttons are `@kstackz/web-platform` Buttons.

## Blockers

**No list of Children.** A Node's Children are a fixed record per State
(`children: { Ready: { composer: Composer } }`). They are created on entering
the State and destroyed on leaving it. So a Node cannot have one Child per row
of its Model that appears and disappears as rows are added and removed. The
natural port, a `Counter` Node per row with its own Path
(`Counters/rows/counter-3`), cannot be written.

What an API could look like: Children derived from the Model, keyed so Replay
creates them in the same order:

```ts
children: {
  rows: Node.each(Counter, (model) => model.rows.map((row) => row.id)),
}
// A View gets children.rows as ReadonlyArray<[id, Handle<Counter>]>
// (or a Map). Removing an id from the Model destroys that Instance; adding
// one creates it. A Child could also receive its key, or init input
// (see todo/notes.md), so a row knows its id.
```

## Testing

Foldkit's `story.test.ts` checks that `ClickedAddRow` appends `counter-2`, that
`ClickedRemoveRow` drops only that row, and that `GotCounterMessage` reaches
only the matching row, or no row if the id is missing. `scene.test.ts` clicks
the second `+` with `nth(all.role('button', { name: '+' }), 1)` and counts rows
with `expectAll(...).toHaveCount(n)`.

Effect Oak needs what [../counter/notes.md](../counter/notes.md) lists: a typed
`Node.step` and a way to draw a View from a given Model. With a list of
Children it would also need a way to send to, or look up, the Child at a key
in a test (`handle.children.rows.get('counter-1')`).
