import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

// v2 renames `colour` to `color`: remove the old field and add the new one in one step.
const Task = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
  colour: Schema.String,
})
  .evolve(
    'v2',
    { colour: null, color: Schema.String },
    ({ colour, ...v1 }) => ({
      ...v1,
      color: colour,
    }),
  )
  .build();

export default Proof.make({
  title: 'A renamed field carries its old value forward',
  description:
    'Renaming is a removal plus an addition in one evolve step; the migration moves the value across.',
  critical: true,
  prepare: Effect.gen(function* () {
    const v1Value = { _v: 'v1', taskId: 't1', title: 'Plan', colour: 'blue' };
    yield* Proof.assert('the v1 value uses the old name', 'colour' in v1Value);
    return { v1Value };
  }),
  act: ({ v1Value }) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(Task.schema)(v1Value);
      const encoded = yield* Schema.encodeEffect(Task.schema)(decoded);
      return { decoded, encoded };
    }),
  verify: ({ decoded, encoded }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the value moved to the new name',
        decoded.color === 'blue',
      );
      yield* Proof.assert(
        'the old name is gone from the decoded value',
        !('colour' in decoded),
      );
      yield* Proof.assert(
        'the written value only has the new name',
        encoded.color === 'blue' && !('colour' in encoded),
      );
    }),
});
