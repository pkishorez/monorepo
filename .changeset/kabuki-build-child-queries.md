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
- `until` checks its test after every Message, so a State one Message enters and the next leaves is seen, and a test that throws ends the wait with a defect.
- A Child is only what `Actor.child` makes: a slot written by hand as `{ actor }` does not compile, and a Child made away from any level fits a parent only if it Emits nothing.
- Types from `@kestack/kabuki/core/actor`: `ChildOf` is gone, as `child` is no longer handed in; `MakeChild` is the type of `Actor.child`. `Query` is gone, as an answer is a function, `Answer`; `Declared` and `DeclaredQueries` are what `define` declares. `ChildOptions<A, D, Msg>` takes the level's data whole, `Given<A, D>` the same; `Queries<Model, State, R, Props, Qs>` takes the declared Queries; `Defined` takes them last, and `Buildable` is the `build` it gives. `Stopped.query` is optional, absent when an `until` was waiting.
- devtools: the Blueprint carries each Query's args and answer as Shapes.
