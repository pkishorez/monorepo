import { Effect, Fiber, Stream } from 'effect';
import { Story } from 'laymos/story';
import { defaultBroadcaster } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { task } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// The table from chapter 10 with one more slot, `GSI2`, for a way in that did not exist when the old rows were written.
export const tableWithStatusIndex = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();

// Task placed as before, plus `byStatus`: a board's tasks grouped by status, then title.
export const taskByStatus = tableWithStatusIndex
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['status', 'title'] })
  .index('GSI2', 'byStatus', { pk: ['boardId'], sk: ['status', 'title'] })
  .build();

// Runs a program against a brand-new, empty copy of the new table in memory.
const onBoard = fresh('memory', tableWithStatusIndex);

// A task saved by the code from before the new way in existed.
const key = { taskId: 't1', boardId: 'work' };
const oldTask = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: 'ana',
  colour: 'blue',
  notes: '',
} as const;

// The open tasks on the `work` board, by the new way in.
const openOnWork = taskByStatus.query('byStatus', {
  pk: { boardId: 'work' },
  beginsWith: { status: 'open', title: '' },
});

// The one stored Task row, exactly as the table holds it.
const storedRow = Stream.runCollect(tableWithStatusIndex.scan()).pipe(
  Effect.flatMap((rows) =>
    Effect.fromNullishOr(rows.find(({ meta }) => meta._e === 'Task')),
  ),
);

export const anOldTaskMeetsANewIndex = Story.make({
  title: 'An old task meets a new index',
  description:
    'A row written before a way in existed cannot be found by it until it is repaired: how the table spots such a row, repairs it without anyone noticing, and refuses a repair that would overwrite a real change.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'An old row predates the new way in. Does the table know it needs repairing?',
      {
        answer:
          'Yes: `drift` compares the keys a row was stored with against the keys the current placement would give it, and reports `drifted` along with `currentForm`, the row as it should be stored. Until `reindex` writes that form back, the new way in simply does not see the row.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // The old code saves a task; it has no keys for the new slot.
              yield* task.insert(oldTask);
              // The new way in cannot see it yet.
              const before = yield* openOnWork;
              // Read the raw row and ask whether it has drifted from its current placement.
              const stored = yield* storedRow;
              const checked = yield* tableWithStatusIndex.drift(stored);
              // Write the corrected row back.
              yield* tableWithStatusIndex.reindex(checked.currentForm);
              // Now the new way in finds it, and a second check reports it clean.
              const after = yield* openOnWork;
              const rechecked = yield* tableWithStatusIndex.drift(
                yield* storedRow,
              );
              yield* Story.assert(
                'the row was invisible to the new way in, and flagged as drifted',
                before.items.length === 0 && checked.drifted,
              );
              yield* Story.assert(
                'after the repair it is found, and no longer drifted',
                after.items[0]?.value.taskId === 't1' && !rechecked.drifted,
              );
              return {
                foundBefore: before.items.length,
                drifted: checked.drifted,
                foundAfter: after.items.length,
                driftedAfter: rechecked.drifted,
              };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Does repairing a row move its update stamp or tell anyone about it?',
      {
        answer:
          'Neither: `reindex` writes the row back under the very `_u` it read, so it is not a new version of the task and no change notice goes out. The first thing a subscriber hears is the next real write.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // The old code saves a task.
              const inserted = yield* task.insert(oldTask);
              // Start listening for one change of any kind.
              const listening = yield* Effect.forkChild(
                Stream.runCollect(
                  tableWithStatusIndex.subscribe().pipe(Stream.take(1)),
                ),
                { startImmediately: true },
              );
              // Repair the row.
              const { currentForm } = yield* tableWithStatusIndex.drift(
                yield* storedRow,
              );
              yield* tableWithStatusIndex.reindex(currentForm);
              const repaired = yield* storedRow;
              // Then make a real change to it.
              const finished = yield* taskByStatus.getAndUpdate(key, {
                status: 'done',
              });
              const [notice] = yield* Fiber.join(listening);
              yield* Story.assert(
                'the repair kept the update stamp',
                repaired.meta._u === inserted.meta._u,
              );
              yield* Story.assert(
                'the only notice was the real write',
                notice?.meta._u === finished.meta._u,
              );
              return {
                stampBefore: inserted.meta._u,
                stampAfterRepair: repaired.meta._u,
                noticed: notice?.meta._u,
              };
            }).pipe(Effect.provide(defaultBroadcaster)),
          ),
        ),
      },
    ),
    Story.question(
      'The task changes for real before the repair lands. Then what?',
      {
        answer:
          'The repair is refused with `ReindexConflict`: `reindex` only writes if the row still carries the `_u` it was checked at, so a real write in between wins and nothing newer is overwritten. The real write already carried the new keys, so a fresh check reports the row clean.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // The old code saves a task, and the repair is prepared.
              yield* task.insert(oldTask);
              const { currentForm } = yield* tableWithStatusIndex.drift(
                yield* storedRow,
              );
              // Before the repair lands, someone finishes the task for real.
              yield* taskByStatus.getAndUpdate(key, { status: 'done' });
              // The stale repair is refused; the failure comes back as a value.
              const refused = yield* tableWithStatusIndex
                .reindex(currentForm)
                .pipe(Effect.flip);
              // The real write placed the row correctly on its own.
              const rechecked = yield* tableWithStatusIndex.drift(
                yield* storedRow,
              );
              yield* Story.assert(
                'the stale repair was refused, not applied',
                refused.reason._tag === 'ReindexConflict',
              );
              yield* Story.assert(
                'the real write already fixed the placement',
                !rechecked.drifted,
              );
              return {
                refused: refused.reason._tag,
                drifted: rechecked.drifted,
              };
            }),
          ),
        ),
      },
    ),
  ],
});
