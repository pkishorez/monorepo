# Practices

## Cursor naming in list / query / subscription payloads

Use comparator symbols (`>`, `>=`, `<`, `<=`) as the payload key, not `cursor`.

```ts
payload: { '>': Schema.NullOr(SomeEntity) }
```

Matches std-toolkit's own query cursor style (e.g. `{ '<': null }`) and reads
directly as "items after/before this point" instead of an opaque `cursor` name.

## No comments

Write no comments. Code should read on its own; if it doesn't, rename or
restructure it instead of explaining it.

## Prefer expressions over statements

When two branches produce the same kind of value (including an `Effect`),
`yield*`/`return` a ternary instead of an `if`/`else` statement duplicating
the `yield*`/`return` in each arm.

```ts
yield* isLocal
  ? dynamo.setup.pipe(...)
  : makeDynamoDBTable(...);
```

Note: `Effect.if` does not exist in this Effect v4 pre-release — use a plain
ternary instead.

## Two-way boolean pick vs. multi-case branch

A plain ternary is correct for picking between two literal values on one
boolean (`isLocal ? { port: 3000 } : undefined`). Reach for `Match` only when
there are multiple discrete cases over a value's shape (e.g. three stage
kinds), not to replace every conditional — `Match` on a bare boolean is
ceremony with no readability or type-safety gain over a ternary.

Extract inline branching in an object literal into a small named function
(`domainFor(stage)`, `devConfigFor(isLocal)`) instead of nesting ternaries
inside the literal — this fixes the readability problem more than swapping
which conditional construct you use.
