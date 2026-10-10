import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

export default Proof.make({
  title: 'Saving an old value back always stores the latest version',
  description:
    'Decoding understands every version; encoding speaks only the latest. No migration runs on the write path.',
  prepare: Effect.gen(function* () {
    const v1Value = { _v: 'v1', taskId: 't1', boardId: 'work', title: 'Plan' };
    const decoded = yield* Schema.decodeUnknownEffect(Task.schema)(v1Value);
    yield* Proof.assert(
      'the old value decoded to the latest shape',
      decoded.priority === 'low',
    );
    return { v1Value, decoded };
  }),
  act: ({ decoded }) =>
    Schema.encodeEffect(Task.schema)(decoded).pipe(
      Effect.map((encoded) => ({ encoded })),
    ),
  verify: ({ encoded }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the written value is stamped v2',
        encoded._v === 'v2',
      );
      yield* Proof.assert(
        'the written value carries the v2 field',
        encoded.priority === 'low',
      );
    }),
});
