import { Effect, Match } from 'effect';
import { Story } from 'laymos/story';
import type { DatabaseError } from 'std-toolkit/db';
import { fresh } from '../../env.js';
import {
  table,
  task,
} from '../10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The task that moves from `work` to `home`, and a second task that stays put.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;
const other = { ...draft, taskId: 't2', title: 'Review it' } as const;

// The per-op report a failed batch carries: one status per op, in the order the ops were given.
const statusesOf = (failure: DatabaseError) =>
  Match.value(failure.reason).pipe(
    Match.tag('TransactFailed', ({ operations }) =>
      operations.map(({ status, detail }) =>
        detail ? `${status} (${detail})` : status,
      ),
    ),
    Match.orElse(() => []),
  );

export const twoWritesThatMustLandTogether = Story.make({
  title: 'Two writes that must land together',
  description:
    'Several writes handed over as one batch: all of them land, or none of them do.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Moving a task to another board takes two writes. How do they land together?',
      {
        answer:
          'Build each write as an op (a write described but not yet done: `insertOp`, `getAndUpdateOp`, `deleteOp`, `restoreOp`) and hand the list to `transact`. The batch commits as one, and returns one stored task per op, in the same order.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the task on `work`.
              yield* task.insert(draft);
              // Describe the two writes: the same task on `home`, and the old one removed.
              const arrive = yield* task.insertOp({
                ...draft,
                boardId: 'home',
              });
              const leave = yield* task.deleteOp(key);
              // Commit both at once; what comes back is one stored task per op.
              const [arrived, left] = yield* table.transact([arrive, leave]);
              // Read both boards.
              const home = yield* task.get({ taskId: 't1', boardId: 'home' });
              const work = yield* task.get(key);
              yield* Story.assert(
                'the task is on home and marked deleted on work',
                home?.meta._d === false && work?.meta._d === true,
              );
              yield* Story.assert(
                'both writes share one update stamp',
                arrived.meta._u === left.meta._u &&
                  home?.meta._u === arrived.meta._u,
              );
              return { arrived, left };
            }),
          ),
        ),
      },
    ),
    Story.question('One of the writes is refused. What happens to the other?', {
      answer:
        'Nothing: the whole batch fails with `TransactFailed` and no op lands, not even the ones that would have been fine. The failure carries a report with one status per op, so you can see which one refused.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save both tasks.
            yield* task.insert(draft);
            yield* task.insert(other);
            // Describe a change to the first task, and a save of a task whose id is already taken.
            const finish = yield* task.getAndUpdateOp(key, { status: 'done' });
            const duplicate = yield* task.insertOp(other);
            // Commit both; the failure comes back as a value.
            const failure = yield* table
              .transact([finish, duplicate])
              .pipe(Effect.flip);
            // Read what the table kept.
            const stored = yield* task.get(key);
            yield* Story.assert(
              'the batch fails as a whole',
              failure.reason._tag === 'TransactFailed',
            );
            yield* Story.assert(
              'the good write did not land either',
              stored?.value.status === 'open',
            );
            return {
              reason: failure.reason._tag,
              report: statusesOf(failure),
              stored,
            };
          }),
        ),
      ),
    }),
    Story.question('What does an empty batch do?', {
      answer:
        'It succeeds and returns an empty list. Nothing is written, and nothing fails.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Commit a batch with nothing in it.
            const written = yield* table.transact([]);
            yield* Story.assert('nothing came back', written.length === 0);
            return { written };
          }),
        ),
      ),
    }),
  ],
});
