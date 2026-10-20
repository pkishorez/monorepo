import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { ESchema, EntityESchema } from '@kestack/std-toolkit/eschema';

// An opaque field: its shape is the caller's, so only the save can check it.
const Reading = EntityESchema.make('Reading', 'readingId', {
  sample: ESchema.fromType<{ readonly value: number }>(),
}).build();

const table = StdTable.make('readings').primary('pk', 'sk').build();
const readings = table.entity(Reading).primary().build();

export default Proof.make({
  title: 'A value JSON cannot hold is refused when it is saved',
  description:
    'JSON stores NaN as null, so a row holding it would never read again. Every save checks the stored form first, on every database, and names the field.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const saved = yield* readings
      .insert({ readingId: 'r1', sample: { value: 21.5 } })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'a finite reading saves',
      saved.value.sample.value === 21.5,
    );
    return { db };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const refused = yield* readings
        .insert({ readingId: 'r2', sample: { value: NaN } })
        .pipe(
          Effect.match({
            onFailure: (error) =>
              `${error.reason._tag}: ${String(error.reason.cause ?? error)}`,
            onSuccess: () => null,
          }),
        );
      const stored = yield* readings.get({ readingId: 'r2' });
      return { refused, stored };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ refused, stored }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the save fails as an encode failure, naming the field',
        refused?.startsWith('EncodeFailed:') === true &&
          refused.includes('/sample/value') &&
          refused.includes('NaN is not a JSON number'),
      );
      yield* Proof.assert('nothing was stored', stored === null);
    }),
});
