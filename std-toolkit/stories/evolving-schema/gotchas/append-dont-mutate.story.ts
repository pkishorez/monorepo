import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Document = ESchema.make('Document', {
  body: Schema.String,
})
  .evolve('v2', { author: Schema.String }, (previous) => ({
    ...previous,
    author: 'unknown',
  }))
  .evolve('v3', { wordCount: Schema.Number }, (previous) => ({
    ...previous,
    wordCount: previous.body.split(/\s+/).length,
  }))
  .build();

export const appendDontMutate = Story.make({
  title: 'Why is appending always safe when editing never is?',
  description:
    'Every row of every vintage keeps a valid path forward — the chain only grows at the end.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

The *Corruption & breaking changes* stories showed how editing history breaks
old rows. This is the flip side: proof that the sanctioned move — **append a
version** — never does.

## Answer

An appended evolution changes nothing any existing row depends on. A v1 row
still validates against the untouched v1 shape and still enters the migration
chain at the same place; the chain is simply longer now. The oldest row in
your database and a row written this morning both arrive at v3.

\`\`\`ts
// shipping v3 does not touch v1 or v2 — it only extends the chain
.evolve('v3', { wordCount: Schema.Number }, (previous) => ({
  ...previous,
  wordCount: previous.body.split(/\\s+/).length,
}))
\`\`\`

This is why "v1 is forever" is not a burden: history is append-only, but it is
*cheap* — each frozen version is a few lines of declaration.
`,
  run: Effect.gen(function* () {
    const ancient = yield* Story.exec(
      'decode the oldest row in the database',
      Document.decode({ _v: 'v1', body: 'hello old world' }),
    );
    yield* Story.assert(
      'a v1 row still decodes after two appends',
      ancient.wordCount === 3,
    );

    const middleAged = yield* Story.exec(
      'decode a v2-era row',
      Document.decode({ _v: 'v2', body: 'hello', author: 'ada' }),
    );
    yield* Story.assert(
      'a v2 row keeps its own data and gains v3 fields',
      middleAged.author === 'ada' && middleAged.wordCount === 1,
    );

    const modern = yield* Story.exec(
      'decode a row written today',
      Document.decode({ _v: 'v3', body: 'hi', author: 'grace', wordCount: 1 }),
    );
    yield* Story.assert(
      'all vintages arrive at the same shape',
      'wordCount' in ancient &&
        'wordCount' in middleAged &&
        'wordCount' in modern,
    );
  }),
});
