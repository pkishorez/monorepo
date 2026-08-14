import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const original = ESchema.make('Player', {
  name: Schema.String,
})
  .evolve('v2', { score: Schema.Number }, (previous) => ({
    ...previous,
    score: 0,
  }))
  .build();

const rewritten = ESchema.make('Player', {
  name: Schema.String,
})
  .evolve('v2', { score: Schema.Number }, (previous) => ({
    ...previous,
    score: 100,
  }))
  .build();

export const changingShippedMigration = Story.make({
  title: 'What if I change a migration after it shipped?',
  description:
    'Rows already re-encoded keep the old result; unread rows get the new one — history forks.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

The v1→v2 migration backfilled \`score: 0\`. Months later someone "improves" it
to backfill \`score: 100\`:

\`\`\`ts
// shipped                                   // rewritten
(previous) => ({ ...previous, score: 0 })    (previous) => ({ ...previous, score: 100 })
\`\`\`

## Answer

Migrations run **only on read**, so the stored v1 rows themselves are
unchanged — but now the *meaning* of a v1 row depends on **when it was read**:

- a v1 row decoded (and re-encoded) before the rewrite is stored at v2 with
  \`score: 0\`, frozen forever;
- a v1 row first read after the rewrite decodes with \`score: 100\`.

Two rows that were byte-identical in storage end up with different values.
That fork is invisible to every runtime check — the schema shapes never
changed, only the semantics.

Treat shipped migrations like shipped versions: **append, don't rewrite**. (The
snapshot module deliberately ignores migration bodies — it guards shapes, so
this one is on your review process.)
`,
  run: Effect.gen(function* () {
    const beforeRewrite = yield* Story.exec(
      'decode a v1 row under the original migration',
      original.decode({ _v: 'v1', name: 'ada' }),
    );
    const afterRewrite = yield* Story.exec(
      'decode a byte-identical v1 row under the rewritten migration',
      rewritten.decode({ _v: 'v1', name: 'ada' }),
    );
    yield* Story.assert(
      'the original migration produced score 0',
      beforeRewrite.score === 0,
    );
    yield* Story.assert(
      'the rewrite produces score 100 from the same bytes',
      afterRewrite.score === 100,
    );
    yield* Story.assert(
      'identical stored rows now disagree',
      beforeRewrite.score !== afterRewrite.score,
    );
  }),
});
