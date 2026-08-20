import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Status = Schema.Literals(['open', 'done']);

const NoteStatus = ValueESchema.make('NoteStatus', Status).build();

export const adoptExistingSchema = Story.make({
  title: 'Adopting a schema you already have',
  description:
    'You can wrap a schema that you already have. It costs nothing now and permits migrations later.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook already had a plain schema for the status of a note. What happens to the data stored under it?',
      {
        answer:
          'Nothing changes. The schema becomes v1. The bare values already in storage read as v1 data.',
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
        'Each new write carries a stamp. The old bare values stay readable, so this change needs no backfill.',
      proof: Effect.gen(function* () {
        const stored = yield* NoteStatus.encode('done');
        yield* Story.assert(
          'new writes are stamped at v1',
          stored._v === 'v1' && stored.value === 'done',
        );
        return stored;
      }),
    }),
    Story.question('What happens when the schema gets a step later?', {
      answer:
        'The old bare values move forward from v1, in the same way as any other value. That is the reason to wrap the schema early.',
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
