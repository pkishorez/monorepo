import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
const oldTask = lastRelease
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byStatus', { pk: ['status'], sk: ['title'] })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'A reindex never overwrites a write that landed after it was prepared',
  description:
    'reindex only writes if the row still carries the update stamp drift read. A real write in between wins.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* oldTask
      .insert({ ...key, title: 'Plan', status: 'open' })
      .pipe(Effect.provide(db.layer));
    const [stored] = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    const { drifted, currentForm } = yield* table
      .drift(stored!)
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('the row needs reindexing', drifted);
    return { db, currentForm };
  }),
  act: ({ db, currentForm }) =>
    Effect.gen(function* () {
      // Someone finishes the task before the reindex lands.
      const finished = yield* task.getAndUpdate(key, { status: 'done' });
      const reindex = yield* table.reindex(currentForm).pipe(
        Effect.match({
          onFailure: (error) => error.reason._tag,
          onSuccess: () => 'written',
        }),
      );
      const stored = yield* task.get(key);
      const [row] = yield* Stream.runCollect(table.scan());
      const { drifted } = yield* table.drift(row!);
      return { reindex, finished, stored, driftedAfter: drifted };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ reindex, finished, stored, driftedAfter }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the stale reindex fails as ReindexConflict',
        reindex === 'ReindexConflict',
      );
      yield* Proof.assert(
        'the real write survives',
        stored?.value.status === 'done' && stored.meta._u === finished.meta._u,
      );
      yield* Proof.assert(
        'the real write already placed the row in the new index',
        !driftedAfter,
      );
    }),
});
