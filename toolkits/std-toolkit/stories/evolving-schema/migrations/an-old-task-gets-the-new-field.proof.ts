import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

// v1 shipped with three fields; v2 adds `priority`, filled in for every v1 value.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

export default Proof.make({
  title: 'An old task gets the new field with its default',
  description:
    'A value written at v1 decodes to the v2 shape, with the field v2 added filled by its migration.',
  critical: true,
  prepare: Effect.gen(function* () {
    // A task exactly as the v1 code encoded it.
    const v1Value = {
      _v: 'v1',
      taskId: 't1',
      boardId: 'work',
      title: 'Plan',
      status: 'open',
    };
    yield* Proof.assert('the schema is at v2', Task.latestVersion === 'v2');
    yield* Proof.assert(
      'the old value has no priority',
      !('priority' in v1Value),
    );
    return { v1Value };
  }),
  act: ({ v1Value }) =>
    Schema.decodeUnknownEffect(Task.schema)(v1Value).pipe(
      Effect.map((decoded) => ({ decoded })),
    ),
  verify: ({ decoded }, { v1Value }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the decoded task has the default priority',
        decoded.priority === 'low',
      );
      yield* Proof.assert(
        'every v1 field survives unchanged',
        decoded.taskId === v1Value.taskId &&
          decoded.boardId === v1Value.boardId &&
          decoded.title === v1Value.title &&
          decoded.status === v1Value.status,
      );
    }),
});
