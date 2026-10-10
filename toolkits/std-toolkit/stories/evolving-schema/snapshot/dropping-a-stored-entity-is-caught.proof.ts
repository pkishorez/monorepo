import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const shipped = StdTable.make('board').primary('pk', 'sk').build();
shipped
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();
shipped
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
// A refactor forgot to register Board.
const forgetful = StdTable.make('board').primary('pk', 'sk').build();
forgetful
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title: 'Dropping an entity whose rows are stored is caught as breaking',
  description:
    'The snapshot sees only what is registered, so an entity left out of the table definition looks removed; stored boards would be orphaned.',
  critical: true,
  prepare: Effect.gen(function* () {
    const accepted = TableSnapshot.capture(shipped);
    yield* Proof.assert(
      'the accepted table has Board and Task',
      accepted.entities
        .map(({ name }) => name)
        .sort()
        .join() === 'Board,Task',
    );
    return { accepted };
  }),
  act: ({ accepted }) =>
    Effect.sync(() => {
      const changes = TableSnapshot.diff(
        accepted,
        TableSnapshot.capture(forgetful),
      );
      return { changes, rendered: TableSnapshot.renderChanges(changes) };
    }),
  verify: ({ changes }) =>
    Proof.assert(
      'removing Board is breaking',
      changes.some(
        ({ impact, subject, action }) =>
          impact === 'breaking' &&
          subject.name === 'Board' &&
          action === 'removed',
      ),
    ),
});
