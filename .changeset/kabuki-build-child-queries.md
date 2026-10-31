---
'@kestack/kabuki': patch
'@kestack/std-toolkit': patch
'@kestack/devtools': patch
'@kestack/connect': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
---

An Actor is built by its definition, a level's Children are a plain object made with `Actor.child`, Queries are declared in `define`, and outside code learns what became of a Message and can wait on an Instance. This is a breaking change.

- A definition builds its Actor: `Auth.build({ … })` in place of `Actor.build(Auth, { … })`, and `Items.build({ pages })` or `Item.build()` in place of `Page.build(…)`. `Actor` is `define` and `child`; `Page` no longer has `build`.
- A level's `children` is a plain object, each Child made with `Actor.child`: `children: { rows: Actor.child(RowLive, { each, input, props, emits }) }`. Every function in it is typed by the level it is written in, its State narrowed in a State's block, as before. `children` written as a function throws.
- A Query is declared in `define` with what it is asked with and what it answers, `queries: { peers: { args: { room: Schema.String }, result: Schema.Array(Schema.String) } }`, and answered in `build` by a function, `queries: { peers: (self, { room }) => Effect }`. Its args and answer are checked against their Schemas, and a Query answered but not declared does not compile. `Page.define` takes `queries` too.
- A live Instance's `send`, and `running.send`, say what became of the Message: `'handled' | 'ignored' | 'queued' | 'refused'`, in place of `true` or `false`.
- A live Instance has `until(test)`: an Effect of the Instance once its data passes the test, narrowed as the test narrows it, failing with `Stopped` if it stops first.
- `running.query(id, name, args)` is removed: ask through `instance.queries`.
- devtools: the Blueprint carries each Query's args and answer as Shapes.
