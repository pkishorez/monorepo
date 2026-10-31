---
'@kestack/kabuki': patch
'@kestack/std-toolkit': patch
'@kestack/devtools': patch
'@kestack/connect': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
---

A Child Emits to its parent, a Child is made with `child`, and an Update gives only what changes. This is a breaking change.

- A Definition takes `emits`, what the Actor may tell its parent. An Update returns `emit`, and the parent's slot turns each one into one of its own Messages: `child(LoginLive, { emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) } })`. That Message is in the History as its own entry, Sent by the Child, with the Source `{ kind: 'emit', instance, name }`. Use it in place of a Capability a parent Provides only so its Child can call back.
- A level's `children` is a function handed `child`: `children: (child) => ({ rows: child(RowLive, { each, input, props }) })`. Every function in it is typed from the parent's data at that level, its State narrowed in a State's block, and checked against the Child's Actor. A slot written as `{ actor, … }` no longer compiles. A Child that needs nothing is `child(TodosLive)`.
- The blocks of the States are written under `states`, not `state`.
- The Model is always a struct, and an Update's `model` holds only the fields that change: `{ model: { draft: text } }`. A Model whose fields all stay the same stays the same object, so its Views do not draw again.
- `Actor.define` and `Page.define` take each Schema whole or as what it is made of: `model: { count: Schema.Number }`, `message: { Added: {}, Removed: { id: Schema.String } }`.
- `Router.app` is `Router.view`: it gives the Router's View, which `View.app` runs.
- std-toolkit: `Replicas.child([…])` is `Replicas.actor([…])`, placed as `child(Replicas.actor([…]))`.
