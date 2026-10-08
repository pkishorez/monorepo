import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// Last deploy and this deploy of the same table.
const shipped = StdTable.make('board').primary('pk', 'sk').build();
shipped
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();
const next = StdTable.make('board').primary('pk', 'sk').build();
next
  .entity(TaskV2)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title: 'Adding a version is a safe change',
  description:
    'Every row already stored still decodes, so the diff classifies the new version as safe.',
  prepare: Effect.gen(function* () {
    const accepted = TableSnapshot.capture(shipped);
    yield* Proof.assert(
      'the accepted snapshot has Task v1 only',
      accepted.schemas[0]?.versions.length === 1,
    );
    return { accepted };
  }),
  act: ({ accepted }) =>
    Effect.sync(() => {
      const changes = TableSnapshot.diff(accepted, TableSnapshot.capture(next));
      return { changes, rendered: TableSnapshot.renderChanges(changes) };
    }),
  verify: ({ changes }) =>
    Effect.gen(function* () {
      yield* Proof.assert('there is a change to report', changes.length > 0);
      yield* Proof.assert(
        'every change is safe',
        changes.every(({ impact }) => impact === 'safe'),
      );
      yield* Proof.assert(
        'the change is the added version v2',
        changes.some(
          ({ subject, action }) =>
            subject.kind === 'version' &&
            subject.version === 'v2' &&
            action === 'added',
        ),
      );
    }),
});
