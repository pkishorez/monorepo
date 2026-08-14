import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Ticket = ESchema.make('Ticket', {
  subject: Schema.String,
})
  .evolve('v2', { fingerprint: Schema.String }, (previous) => ({
    ...previous,
    fingerprint: `${previous.subject.length}:${previous.subject.slice(0, 3).toLowerCase()}`,
  }))
  .build();

export const pureMigrations = Story.make({
  title: 'Why do migrations have to be pure?',
  description:
    'The same stored row must decode identically today, tomorrow, and on every replica.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A tempting impure migration:

\`\`\`ts
// ✗ don't: same row, different value every read
(previous) => ({ ...previous, importedAt: Date.now() })
\`\`\`

## Answer

Migrations run **on read**, and a row may be read many times before it is ever
re-encoded — by different processes, on different days, on different replicas.
An impure migration (clocks, randomness, IO, ambient config) makes those reads
disagree: the same bytes in storage decode to different values, caches and
replicas drift, and tests stop reproducing production.

Derive only from the previous value:

\`\`\`ts
// ✓ deterministic: derived purely from the row itself
(previous) => ({
  ...previous,
  fingerprint: \`\${previous.subject.length}:\${previous.subject.slice(0, 3).toLowerCase()}\`,
})
\`\`\`

If a new field genuinely needs outside information (the current time, a
service call), it cannot be a migration backfill — write it at the call site
where that information honestly exists.
`,
  run: Effect.gen(function* () {
    const row = { _v: 'v1', subject: 'Printer on fire' };
    const first = yield* Story.exec('decode the row once', Ticket.decode(row));
    const second = yield* Story.exec(
      'decode the identical row again',
      Ticket.decode(row),
    );
    yield* Story.assert(
      'two reads of the same bytes agree exactly',
      first.fingerprint === second.fingerprint,
    );
    yield* Story.assert(
      'the derived value comes only from the row',
      first.fingerprint === '15:pri',
    );
  }),
});
