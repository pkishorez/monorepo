import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Status = Schema.Literals(['open', 'done']);

const NoteStatus = ValueESchema.make('NoteStatus', Status).build();

export const adoptExistingSchema = Story.make({
  title: 'Adopting a schema you already have',
  description:
    'Wrapping an existing schema costs nothing today and buys migrations later.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      "The notebook already had a plain schema for a note's status. What happens to everything stored under it?",
      {
        answer:
          'Nothing changes. The existing schema becomes v1, and the bare unstamped values already in storage read as v1 data.',
        proof: Effect.gen(function* () {
          const legacy = yield* NoteStatus.decode('open');
          yield* Story.assert(
            'values stored before adoption decode as-is',
            legacy === 'open',
          );
          return legacy;
        }),
      },
    ),
    Story.question('What changes on the next write?', {
      answer:
        'New writes carry a stamp. Old bare values stay readable, so adoption never needs a backfill.',
      proof: Effect.gen(function* () {
        const stored = yield* NoteStatus.encode('done');
        yield* Story.assert(
          'new writes are stamped at v1',
          stored._v === 'v1' && stored.value === 'done',
        );
        return stored;
      }),
    }),
    Story.question('And when the adopted schema later grows a rung?', {
      answer:
        'The old bare values fold forward from v1 like anything else — which is the whole point of adopting it early.',
      proof: Effect.gen(function* () {
        const Evolved = ValueESchema.make('NoteStatus', Status)
          .evolve('v2', Schema.Literals(['OPEN', 'DONE']), (previous) =>
            previous === 'open' ? 'OPEN' : 'DONE',
          )
          .build();
        const migrated = yield* Evolved.decode('open');
        yield* Story.assert(
          'the bare legacy value reaches the latest shape',
          migrated === 'OPEN',
        );
        return migrated;
      }),
    }),
  ],
});
