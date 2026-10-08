import { Effect, Fiber, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { defaultBroadcaster } from '@kstackz/std-toolkit/core';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

// The last release had no byStatus pattern. This release adds it on GSI1.
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

const openTasks = task.query('byStatus', {
  pk: { status: 'open' },
  '>=': null,
});

export default Proof.make({
  title:
    'A task stored before a new index existed is found by it once reindexed',
  description:
    'drift spots the missing index keys; reindex writes them under the same update stamp and announces nothing.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const written = yield* oldTask
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan', status: 'open' })
      .pipe(Effect.provide(db.layer));
    const before = yield* openTasks.pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the new index cannot see the old task',
      before.items.length === 0,
    );
    return { db, written };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const listening = yield* Effect.forkChild(
        Stream.runCollect(table.subscribe().pipe(Stream.take(1))),
        { startImmediately: true },
      );
      const [stored] = yield* Stream.runCollect(table.scan());
      const checked = yield* table.drift(stored!);
      yield* table.reindex(checked.currentForm);
      const [repaired] = yield* Stream.runCollect(table.scan());
      const rechecked = yield* table.drift(repaired!);
      const after = yield* openTasks;
      // The next real write is the first thing a subscriber hears.
      const finished = yield* task.getAndUpdate(
        { boardId: 'work', taskId: 't1' },
        { status: 'done' },
      );
      const [firstNotice] = yield* Fiber.join(listening);
      return {
        drifted: checked.drifted,
        keysBefore: stored!.keys,
        keysAfter: repaired!.keys,
        driftedAfter: rechecked.drifted,
        found: after.items.map(({ value }) => value.taskId),
        stampAfterRepair: repaired!.meta._u,
        firstNoticeStamp: firstNotice?.meta._u ?? null,
        realWriteStamp: finished.meta._u,
      };
    }).pipe(Effect.provide(db.layer), Effect.provide(defaultBroadcaster)),
  verify: (output, { written }) =>
    Effect.gen(function* () {
      yield* Proof.assert('drift reported the old row', output.drifted);
      yield* Proof.assert(
        'after reindex the new index finds it',
        output.found.join() === 't1',
      );
      yield* Proof.assert(
        'a second check reports it clean',
        !output.driftedAfter,
      );
      yield* Proof.assert(
        'the repair kept the update stamp',
        output.stampAfterRepair === written.meta._u,
      );
      yield* Proof.assert(
        'the repair announced nothing',
        output.firstNoticeStamp === output.realWriteStamp,
      );
    }),
});
