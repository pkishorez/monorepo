---
'@kestack/kabuki': patch
'@kestack/std-toolkit': patch
---

A Child can tell its parent things (Emits), and an Update returns only what changed. **Breaking.**

**New**

- `emits` in a definition lists what an Actor may tell its parent. An Update returns `emit`, and the parent turns each into one of its own Messages:
  `Actor.child(LoginLive, { emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) } })`.
  Use it instead of a Capability that exists only so a Child can call back. Each one shows in the History as its own entry.
- `define` takes a Schema's fields directly: `model: { count: Schema.Number }`, `message: { Added: {}, Removed: { id: Schema.String } }`.

**Breaking**

- The Model is always a struct, and an Update's `model` holds only the fields that change: `{ model: { draft: text } }`. When nothing changes, the Model stays the same object and its Views don't redraw.
- `state: { … }` → `states: { … }`.
- `Router.app` → `Router.view`: `View.app(Router.view(router, AppView), { layer })`.
- std-toolkit: `Replicas.child([…])` → `Actor.child(Replicas.actor([…]))`.
