# An Actor is built by its definition, and a Child is made with `Actor.child`

Amends [ADR 0044](0044-a-child-emits-to-its-parent-and-is-made-with-child.md). A level's `children` was a function handed `child`, the one thing in a level written as a function of something Kabuki passed in, while `workers`, `queries` and `on` were plain objects. It was a function for TypeScript alone: inside `Actor.build(Auth, { … })`, the definition's types are still being inferred while the Build is checked, so a generic call written in the Build, `child(LoginLive, { … })`, cannot see its parent's data. It does not fail; it stops checking. A function's parameters are typed later in inference, which is why `child` had to be handed in.

The definition now builds its Actor: `Auth.build({ … })`. Its types are fixed before the Build is written, so a Child is made in a plain object with a function anyone imports, `children: { login: Actor.child(LoginLive, { … }) }`, typed by the level it is written in, its State narrowed in a State's block, and checked against the parent's data and the Child's Actor as before. A page is built the same way, `Items.build({ pages: { Item: ItemLive } })`. `Actor.build` and `Page.build` are gone; `Actor` is `define` and `child`.

## Considered Options

- **`children: () => ({ … })` with `Actor.child`**: rejected. Typed in full, since a function's body is typed late as its parameters are, but still a function, with nothing in it but the typing.
- **`children` as plain entries, `{ actor: LoginLive, each, props }`**: rejected. Each entry's functions are typed by the `actor` beside them, which TypeScript can do only with a type parameter per level, and the Build is one.
- **Keeping `children: (child) => …`**: rejected once a plain object could be typed in full.

## Consequences

- The plain object was checked against every case the function was: Props and Input of the wrong type or left out, an Emit the Child does not have or one turned into a Message the parent does not have, the parent's data read where it is not, the State narrowed in a State's block, the Children a View finds, and the Capabilities a Child still needs bubbling up. `src/core/tests/child.test-d.ts` keeps those checks.
- Every Build moved with a codemod: `Actor.build(X, …)` and `Page.build(X, …)` are `X.build(…)`, and `children: (child) => ({ … child(…) })` is `children: { … Actor.child(…) }`.
- `children` written as a function throws, naming the Actor, for a page too.
- What `Actor.child` makes is branded, as in ADR 0044: a slot written by hand does not compile. The brand reads the level's data and gives the parent's Messages, so a Child made away from any level, typed by nothing, fits a parent only if it Emits nothing.
- A `children` worked out at runtime, as std-toolkit's Replicas makes one Child per replica, has no level to type it, so its functions name their data's type.
