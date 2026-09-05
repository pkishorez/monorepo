import { Effect, Match } from 'effect';
import { Story } from 'laymos/story';
import type { DatabaseError } from 'std-toolkit/db';
import { fresh } from '../../env.js';
import {
  table,
  task,
} from '../10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { board } from '../11-keeping-boards-and-tasks-in-the-same-table/keeping-boards-and-tasks-in-the-same-table.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The `work` board, and two tasks for it.
const work = { boardId: 'work', name: 'Work' };
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

export const writingOnlyIfSomethingIsStillTrue = Story.make({
  title: 'Writing only if something is still true',
  description:
    'A batch can carry conditions beside its writes: a row must be there, must not be there, or must still satisfy a rule.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A task may only be added to a board that still exists. How do I say that?',
      {
        answer:
          'Put a check op (a condition on a row, with no write of its own) in the same batch: `existsOp` takes a key and holds only while that row is there. A check returns `null` in its position, and if it fails the batch fails and the write beside it never lands.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the board.
              yield* board.insert(work);
              // Add a task, on the condition that its board is still there.
              const written = yield* table.transact([
                yield* board.existsOp({ boardId: 'work' }),
                yield* task.insertOp(draft),
              ]);
              // Try the same for a board that was never saved; the failure comes back as a value.
              const failure = yield* table
                .transact([
                  yield* board.existsOp({ boardId: 'ghost' }),
                  yield* task.insertOp({ ...other, boardId: 'ghost' }),
                ])
                .pipe(Effect.flip);
              // Read what the table kept for the second task.
              const ghost = yield* task.get({ taskId: 't2', boardId: 'ghost' });
              yield* Story.assert(
                'the check holds, the task lands, and the check takes a null slot',
                written[0] === null && written[1].value.taskId === 't1',
              );
              yield* Story.assert(
                'a missing board fails the check and stops the write',
                failure.reason._tag === 'TransactFailed' && ghost === null,
              );
              return { written, report: statusesOf(failure), ghost };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'How does a batch say a row must not be there yet, and does a deleted row count as there?',
      {
        answer:
          '`notExistsOp` holds only while the key is free, and a batch may be checks only, in which case it asserts and writes nothing. A deleted task is still a row, so `existsOp` passes on it and `notExistsOp` fails: existence means the row is stored, not that it is live.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save a task and delete it, so a marked row is left behind.
              yield* task.insert(draft);
              yield* task.delete(key);
              // A batch of nothing but checks: the deleted row is still there, and `t2` is still free.
              const checks = yield* table.transact([
                yield* task.existsOp(key),
                yield* task.notExistsOp({ taskId: 't2', boardId: 'work' }),
              ]);
              // Treat the deleted row as absent; the failure comes back as a value.
              const failure = yield* table
                .transact([
                  yield* task.notExistsOp(key),
                  yield* task.insertOp(other),
                ])
                .pipe(Effect.flip);
              // Read what the table kept for the second task.
              const second = yield* task.get({ taskId: 't2', boardId: 'work' });
              yield* Story.assert(
                'a checks-only batch passes with a null per check',
                checks.length === 2 && checks.every((slot) => slot === null),
              );
              yield* Story.assert(
                'the deleted row still counts as there, so the write is stopped',
                failure.reason._tag === 'TransactFailed' && second === null,
              );
              return { checks, report: statusesOf(failure), second };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'A task that is done must not change. How is that enforced when the batch commits?',
      {
        answer:
          'Give the write op a `check` on the current value, as in chapter 5; the batch reads the row at commit time and refuses if the rule says no. To apply a rule to a row the batch only looks at, `getAndCheckOp` takes a key and the same kind of rule.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save both tasks, and finish the first.
              yield* task.insert(draft);
              yield* task.insert(other);
              yield* task.getAndUpdate(key, { status: 'done' });
              // Retitle the finished task, on the condition that it is not done; the failure comes back as a value.
              const refused = yield* table
                .transact([
                  yield* task.getAndUpdateOp(
                    key,
                    { title: 'Write the plan (v2)' },
                    { check: (current) => current.status !== 'done' },
                  ),
                ])
                .pipe(Effect.flip);
              // Retitle the second task, on the condition that the first one is done; this one holds.
              const [, retitled] = yield* table.transact([
                yield* task.getAndCheckOp(
                  key,
                  (current) => current.status === 'done',
                ),
                yield* task.getAndUpdateOp(
                  { taskId: 't2', boardId: 'work' },
                  { title: 'Review it (v2)' },
                ),
              ]);
              // Read what the table kept for the finished task.
              const stored = yield* task.get(key);
              yield* Story.assert(
                'the rule refused the edit and the task kept its title',
                refused.reason._tag === 'TransactFailed' &&
                  stored?.value.title === 'Write the plan',
              );
              yield* Story.assert(
                'a rule on a row that is only checked guards the write beside it',
                retitled.value.title === 'Review it (v2)',
              );
              return { report: statusesOf(refused), stored, retitled };
            }),
          ),
        ),
      },
    ),
  ],
});
