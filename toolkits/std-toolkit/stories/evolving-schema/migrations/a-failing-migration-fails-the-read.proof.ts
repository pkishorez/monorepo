import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

// A migration that forgot a legacy case: it only knows how to parse numbers.
const Task = EntityESchema.make('Task', 'taskId', {
  estimate: Schema.String,
})
  .evolve('v2', { estimate: Schema.Number }, (v1) => {
    const hours = Number(v1.estimate);
    if (Number.isNaN(hours)) throw new Error(`not a number: ${v1.estimate}`);
    return { ...v1, estimate: hours };
  })
  .build();

export default Proof.make({
  title: 'A migration that throws fails the read instead of returning a guess',
  description:
    'Migrations must be total. When one is not, the decode fails for that value; other values still read.',
  prepare: Effect.gen(function* () {
    const readable = yield* Schema.decodeUnknownEffect(Task.schema)({
      _v: 'v1',
      taskId: 't1',
      estimate: '3',
    });
    yield* Proof.assert(
      'a value the migration handles reads',
      readable.estimate === 3,
    );
    return { readable };
  }),
  act: () =>
    Schema.decodeUnknownEffect(Task.schema)({
      _v: 'v1',
      taskId: 't2',
      estimate: 'a few hours',
    }).pipe(
      Effect.match({
        onFailure: (error) => ({ failed: true, message: error.message }),
        onSuccess: (value) => ({
          failed: false,
          message: JSON.stringify(value),
        }),
      }),
    ),
  verify: ({ failed }) =>
    Proof.assert(
      'the value the migration cannot handle fails to decode',
      failed,
    ),
});
