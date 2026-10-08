import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
// The mistake: priority written into v1 instead of added as v2.
const TaskEditedInPlace = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  priority: Schema.Literals(['low', 'high']),
}).build();

const shipped = StdTable.make('board').primary('pk', 'sk').build();
shipped
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
const edited = StdTable.make('board').primary('pk', 'sk').build();
edited
  .entity(TaskEditedInPlace)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title: 'Editing a shipped version is caught as breaking',
  description:
    'The types cannot see that v1 changed after rows were written. The snapshot diff can, and a v1 row really no longer decodes.',
  critical: true,
  prepare: Effect.gen(function* () {
    const accepted = TableSnapshot.capture(shipped);
    // A row the shipped code wrote.
    const shippedRow = {
      _v: 'v1',
      taskId: 't1',
      boardId: 'work',
      title: 'Plan',
    };
    const readByShipped = yield* Schema.decodeUnknownEffect(Task.schema)(
      shippedRow,
    );
    yield* Proof.assert(
      'the shipped code reads its own row',
      readByShipped.title === 'Plan',
    );
    return { accepted, shippedRow };
  }),
  act: ({ accepted, shippedRow }) =>
    Effect.gen(function* () {
      const changes = TableSnapshot.diff(
        accepted,
        TableSnapshot.capture(edited),
      );
      const strandedRow = yield* Schema.decodeUnknownEffect(
        TaskEditedInPlace.schema,
      )(shippedRow).pipe(
        Effect.match({
          onFailure: () => 'fails to decode',
          onSuccess: () => 'decodes',
        }),
      );
      return {
        changes,
        rendered: TableSnapshot.renderChanges(changes),
        strandedRow,
      };
    }),
  verify: ({ changes, strandedRow }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the edit to v1 is classified breaking',
        changes.some(
          ({ impact, subject }) =>
            impact === 'breaking' && subject.version === 'v1',
        ),
      );
      yield* Proof.assert(
        'and a stored v1 row really is stranded',
        strandedRow === 'fails to decode',
      );
    }),
});
