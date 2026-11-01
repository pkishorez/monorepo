import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { TableSnapshot } from '@kestack/std-toolkit/snapshot';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  dueAt: Schema.NullOr(Schema.DateFromString),
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e
      .primary({ pk: ['boardId'] })
      .index('GSI1', 'byPriority', { pk: ['priority'], sk: ['title'] }),
  )
  .build();

export default Proof.make({
  title:
    'A captured snapshot is plain JSON that reads back as the same snapshot',
  description:
    'Capture describes topology, entities, and every version of every schema in encoded form; serialize, write as JSON, and parse restore it with no code needed.',
  prepare: Effect.sync(() => {
    const captured = TableSnapshot.capture(table);
    return { captured };
  }).pipe(
    Effect.tap(({ captured }) =>
      Proof.assert(
        'the snapshot lists both Task versions',
        captured.schemas[0]?.versions.length === 2,
      ),
    ),
  ),
  act: ({ captured }) =>
    Effect.gen(function* () {
      const serialized = yield* TableSnapshot.serialize(captured);
      const json = JSON.stringify(serialized);
      const restored = yield* TableSnapshot.parse(JSON.parse(json));
      return { json: JSON.parse(json) as unknown, restored };
    }),
  verify: ({ restored }, { captured }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the restored snapshot has no changes against the capture',
        TableSnapshot.diff(captured, restored).length === 0,
      );
      yield* Proof.assert(
        'a Date field is described by what is stored: a string',
        JSON.stringify(restored.schemas[0]?.versions[0]?.shape).includes(
          '"string"',
        ),
      );
    }),
});
