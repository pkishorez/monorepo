# Adopting eschema over existing data

You rarely start a project with eschema in place. More often you have a live
table full of rows written by code that never heard of `_v`. The package is
designed for exactly this: **adopting it is non-breaking.**

## Unstamped data decodes as v1

`decode` reads a row's `_v` to pick a version. When there is **no `_v`**, eschema
treats the row as `v1` — the earliest version in the chain. So the adoption
recipe is:

1. Wrap your current shape as `v1` exactly as it is persisted today.
2. Ship it. While there is only one version, decode is a pure no-op over your
   existing rows — none of them have a `_v`, all of them read as v1.
3. Later, add `.evolve` steps. Legacy rows fold forward from v1 automatically.

```ts
const User = ESchema.make({
  name: Schema.String,
  age: Schema.Number,
}).build();

// A legacy row, written before eschema existed — no _v anywhere.
const legacy = { name: 'Ada', age: 36 };
```

This is why **v1 must mirror real historical data.** If an unstamped row does
not match v1, decode fails loudly rather than guessing — that's intentional.
Define v1 to match what was actually written.

::test-group{id=unstamped-is-v1}
