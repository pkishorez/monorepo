import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  ownerId: Schema.String,
  title: Schema.String,
}).build();

const shipped = StdTable.make('board').primary('pk', 'sk').build();
shipped
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
// Tasks now partitioned by owner: every stored row sits under a key this table never looks up.
const rekeyed = StdTable.make('board').primary('pk', 'sk').build();
rekeyed
  .entity(Task)
  .primary({ pk: ['ownerId'] })
  .build();

export default Proof.make({
  title: "Changing an entity's partition key is caught as breaking",
  critical: true,
  prepare: Effect.gen(function* () {
    const accepted = TableSnapshot.capture(shipped);
    yield* Proof.assert(
      'Task is partitioned by board',
      accepted.entities[0]?.primary.pk.join() === 'boardId',
    );
    return { accepted };
  }),
  act: ({ accepted }) =>
    Effect.sync(() => {
      const changes = TableSnapshot.diff(
        accepted,
        TableSnapshot.capture(rekeyed),
      );
      return { changes, rendered: TableSnapshot.renderChanges(changes) };
    }),
  verify: ({ changes }) =>
    Proof.assert(
      'the re-key is breaking',
      changes.some(({ impact }) => impact === 'breaking'),
    ),
});
