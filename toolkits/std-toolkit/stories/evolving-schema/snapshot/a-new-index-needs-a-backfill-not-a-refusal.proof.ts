import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  assignee: Schema.String,
}).build();

const shipped = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
shipped
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
const withPattern = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
withPattern
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['title'] })
  .build();

export default Proof.make({
  title: 'A new index on an existing entity needs a backfill, not a refusal',
  description:
    'Rows already stored have no keys for the new pattern until they are reindexed; nothing is lost, so the deploy may proceed with a warning.',
  prepare: Effect.gen(function* () {
    const accepted = TableSnapshot.capture(shipped);
    yield* Proof.assert(
      'the accepted Task has only its primary pattern',
      accepted.entities[0]?.accessPatterns.length === 1,
    );
    return { accepted };
  }),
  act: ({ accepted }) =>
    Effect.sync(() => {
      const changes = TableSnapshot.diff(
        accepted,
        TableSnapshot.capture(withPattern),
      );
      return { changes, rendered: TableSnapshot.renderChanges(changes) };
    }),
  verify: ({ changes }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the added pattern requires backfill',
        changes.some(
          ({ impact, subject, action }) =>
            impact === 'requires-backfill' &&
            subject.kind === 'access-pattern' &&
            action === 'added',
        ),
      );
      yield* Proof.assert(
        'nothing is breaking',
        changes.every(({ impact }) => impact !== 'breaking'),
      );
    }),
});
