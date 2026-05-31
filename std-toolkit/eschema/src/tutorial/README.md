# eschema tutorial

A hands-on, runnable tour of evolving schemas. Each lesson is a self-contained,
type-checked TypeScript file you can read top-to-bottom and run. They build on
each other — start at lesson 1.

Run any lesson with [tsx](https://github.com/privatenumber/tsx):

```bash
npx tsx src/tutorial/01-first-schema.ts
```

(The `// =>` comments next to each `console.log` show the expected output.)

## Lessons

| #   | File                                                                     | What you'll learn                                                                                   |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | [`01-first-schema.ts`](./01-first-schema.ts)                             | What an evolving schema is. `make` → `build` → `encode`/`decode`, and the `_v` stamp.               |
| 2   | [`02-evolving-fields.ts`](./02-evolving-fields.ts)                       | Adding fields with `.evolve` (a delta + a migration); chaining v1 → v2 → v3.                        |
| 3   | [`03-adopting-existing-data.ts`](./03-adopting-existing-data.ts)         | Wrapping a plain Effect Schema. **Unstamped legacy data decodes as v1** — adoption is non-breaking. |
| 4   | [`04-transform-rename-remove.ts`](./04-transform-rename-remove.ts)       | Field transforms, removing a field (`null` delta), and renaming (remove + add).                     |
| 5   | [`05-value-eschema.ts`](./05-value-eschema.ts)                           | `ValueESchema`: whole-value evolution, the value envelope, and **bare values**.                     |
| 6   | [`06-composition.ts`](./06-composition.ts)                               | Nesting schemas with `toSchema`; arrays of nested schemas; independent versioning.                  |
| 7   | [`07-non-isolation.ts`](./07-non-isolation.ts)                           | The gotcha: evolving a **child** shifts the **parent's** decoded shape.                             |
| 8   | [`08-gotchas-and-best-practices.ts`](./08-gotchas-and-best-practices.ts) | Reserved keys, **`NullOr` over `optional`**, total migrations, immutability.                        |

## The one-paragraph mental model

An evolving schema is a chain of versions from `v1` to the latest. **Encode**
always writes the latest version and stamps `_v`. **Decode** reads the `_v`,
finds that version in the chain, and **folds forward** — applying each migration
in order until the value matches the latest shape. Data with no `_v` is treated
as `v1`, which is what makes adopting eschema on top of existing data safe. When
schemas are nested via `toSchema`, every level folds forward through its own
chain independently — powerful, but it means decode behaviour is a property of
the whole tree, not one schema (lesson 7).
