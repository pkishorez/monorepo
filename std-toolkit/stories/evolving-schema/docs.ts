import { Story } from 'laymos/story';

export const whySchemasMustEvolve = Story.doc({
  title: 'Why schemas must evolve',
  description:
    'Data outlives code. Evolving schemas keep old rows readable forever.',
  markdown: `
Your code ships in versions. Your data does not — a row written in January is
still sitting in the database in December, shaped exactly the way January's
code shaped it.

The moment you add a field, every existing row becomes a liar: it claims to be
a \`User\`, but it has no \`age\`. You now have three bad options:

- **Backfill the table** — a migration script per deploy, downtime, and a
  window where old and new code disagree about what a row looks like.
- **Sprinkle defensive code** — \`user.age ?? 0\` at every read site, forever,
  with no record of *why*.
- **Never change anything** — the schema fossilizes.

An **evolving schema** (ESchema) picks a fourth option: **keep every version,
and migrate on read**. The schema itself records each version of the shape and
a migration function from one version to the next. Every stored payload carries
a version stamp \`_v\`. When a row is decoded, the runtime looks at its stamp,
decodes it with *that* version's schema, then folds it forward through every
migration until it reaches the latest shape.

\`\`\`ts
const User = ESchema.make('User', {
  name: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();

// a January row: { _v: 'v1', name: 'Alice' }
// decode() → { name: 'Alice', age: 0 }   — always the latest shape
\`\`\`

The database never has to change. Old rows are never rewritten. Code only ever
sees the latest shape. The full history of the schema lives in one declaration,
in one file, under version control.

The stories in this group walk through everything that follows from that idea:
how to define evolutions, exactly what happens on decode and encode, how a
schema gets corrupted, and the edge cases you will eventually hit.
`,
});

export const kindsOfESchema = Story.doc({
  title: 'The three kinds of ESchema',
  description:
    'Struct, entity, and value schemas — and when to reach for each.',
  markdown: `
Every ESchema shares the same core: an ordered list of versions, a migration
between each pair, and a \`_v\` stamp on the encoded side. There are three
kinds, differing only in what shape they version.

## Struct — \`ESchema\`

The plain kind: a named object with fields.

\`\`\`ts
const Settings = ESchema.make('Settings', {
  theme: Schema.String,
}).build();
\`\`\`

Use it for any object that is not an entity — configuration, embedded
sub-objects, message payloads.

## Entity — \`EntityESchema\`

A struct plus an **identity**. You name the id field once and the builder
reserves it: it is automatically added as \`Schema.String\` to *every* version,
and no evolution is allowed to touch it.

\`\`\`ts
const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
}).build();
\`\`\`

Use it for anything stored and referenced by id. The reserved id is what the
storage and sync layers key on, which is why it must survive every migration
untouched.

## Value — \`ValueESchema\`

A single versioned value — a scalar, an enum, a union — with no object around
it. Since there is no struct to hang \`_v\` on, the encoded form wraps the value
in an envelope: \`{ _v: 'v2', value: … }\`.

\`\`\`ts
const Rating = ValueESchema.make('Rating', Schema.String)
  .evolve('v2', Schema.Number, (previous) => Number(previous))
  .build();
\`\`\`

Unlike struct evolutions (which merge a field delta), each value evolution
**replaces the whole codec** — v2 above is a number even though v1 was a
string.

## The bridge: \`toSchema\`

Any ESchema can be wrapped as a plain Effect Schema with \`toSchema(eschema)\`,
so evolving schemas compose inside ordinary structs — a versioned value inside
a versioned entity inside a table row.
`,
});

export const limitationsAndBestPractices = Story.doc({
  title: 'Limitations and best practices',
  description:
    'What evolving schemas will not do for you, and the habits that keep them safe.',
  markdown: `
Evolving schemas move migration from deploy time to read time. That trade has
sharp edges worth knowing before you rely on it.

## What it will not do

- **It will not stop you editing history.** Nothing at runtime or in the types
  detects that you changed v1's fields after rows were written. The schema
  happily decodes new data and silently fails on old data. The snapshot module
  exists precisely to catch this in review — see the *Corruption & breaking
  changes* stories.
- **Migrations only run on read.** A row written at v1 stays a v1 row on disk
  until something decodes and re-encodes it. If you delete the v1→v2 migration
  from your code, unread v1 rows become undecodable.
- **Version sequencing is compile-time only.** \`evolve\` accepts only the next
  version literal (\`'v2'\` after \`'v1'\`), but that guarantee lives in the
  types. Nothing re-checks it at runtime, so generated or hand-edited
  declarations are on their own.
- **\`makePartial\` does not validate.** It stamps \`_v\` onto whatever partial
  you hand it and returns it — transformed fields stay in their decoded form.
  It is a typing convenience for patches, not a codec.
- **Value envelopes detect by shape.** A *bare* (unstamped) object value that
  happens to contain a \`_v\` key is mistaken for an envelope. Stamped data is
  unambiguous — the gotcha only bites pre-adoption data.

## Habits that keep evolutions safe

- **v1 is forever.** Never edit a shipped version's fields or its migration —
  append a new version instead.
- **Migrations must be total.** The function receives *every* value the
  previous version could decode. Handle nulls, empty strings, and the weird
  legacy cases — a throw inside a migration fails the whole decode.
- **Keep migrations pure.** No clocks, no randomness, no IO. The same stored
  row must decode to the same value today, tomorrow, and on every replica.
- **Model absence with \`Schema.NullOr\`,** never optional fields — the builder
  forbids optionals so that every version has exactly one canonical shape.
- **Snapshot your contracts.** Capture an approved snapshot in review and diff
  against it in CI; appended versions classify as \`safe\`, edits to approved
  versions as \`breaking\`.
`,
});
