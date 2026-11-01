---
'@kestack/kabuki': patch
'@kestack/devtools': patch
---

Definitions build their own Actor, Children are a plain object, and Queries are typed. **Breaking.**

**Breaking**

- `Actor.build(Auth, { … })` → `Auth.build({ … })`, and `Page.build(…)` → `Items.build({ pages })`. `Actor` is now just `define` and `child`.
- `children` is a plain object of `Actor.child(…)` slots, each typed by the level it sits in:
  `children: { rows: Actor.child(RowLive, { each, input, props, emits }) }`.
  A hand-written `{ actor }` slot no longer compiles.
- A Query is declared in `define` and answered in `build`; args and answer are checked against their Schemas:
  `queries: { peers: { args: { room: Schema.String }, result: Schema.Array(Schema.String) } }` in `define`,
  `queries: { peers: (self, { room }) => … }` in `build`.
- `send` returns what happened to the Message, `'handled' | 'ignored' | 'queued' | 'refused'`, instead of `true` / `false`.
- `running.query(id, name, args)` is removed: use `instance.queries`.
- Types in `core/actor`: `ChildOf` → `MakeChild`, `Query` → `Answer`; `Declared` and `DeclaredQueries` are new; `Stopped.query` is optional.

**New**

- `instance.until(test)` waits until the Instance's data passes `test`, narrowed to match, and fails with `Stopped` if it stops first.
- devtools: the Blueprint shows each Query's args and answer.
