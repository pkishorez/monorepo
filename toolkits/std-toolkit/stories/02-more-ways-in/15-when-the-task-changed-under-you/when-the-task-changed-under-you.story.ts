import { Effect, Match } from 'effect';
import { Story } from 'laymos/story';
import type { DatabaseError } from 'std-toolkit/db';
import { fresh } from '../../env.js';
import {
  table,
  task,
} from '../10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { settings } from '../12-one-record-that-exists-exactly-once/one-record-that-exists-exactly-once.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The task that changes under us, and a second task saved beside it.
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

export const whenTheTaskChangedUnderYou = Story.make({
  title: 'When the task changed under you',
  description:
    'An op describes a change, not a copy of the task. What happens when the task moves on before the batch commits.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The task changed between building the batch and committing it. Is the batch wrong?',
      {
        answer:
          'No: an op carries what to do, not the task as it was, so the batch reads the task again at commit time and applies the change to what it finds. With no condition attached the write goes through in any case; a single `getAndUpdate` does the same, retrying up to three times if the task moves while it works.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the task and describe a change built from the current title.
              yield* task.insert(draft);
              const held = yield* task.getAndUpdateOp(key, (current) => ({
                title: `${current.title}!`,
              }));
              // Meanwhile, the task is finished by someone else.
              const finished = yield* task.getAndUpdate(key, {
                status: 'done',
              });
              // Commit the held change beside a second save.
              const [second, applied] = yield* table.transact([
                yield* task.insertOp(other),
                held,
              ]);
              yield* Story.assert(
                'the change was applied to the newer task',
                applied.value.title === 'Write the plan!' &&
                  applied.value.status === 'done' &&
                  applied.meta._u > finished.meta._u,
              );
              yield* Story.assert(
                'and the second save landed beside it',
                second.value.taskId === 't2',
              );
              return { finished, applied, second };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'I read the task, decided something, and built the batch. How does that decision still hold at commit?',
      {
        answer:
          'Add `unchangedOp` with the task as you read it: the batch holds only while the stored update stamp is still the one you saw, and fails as stale otherwise. The settings have `unchangedOp` too, and one taken before anything was written holds as "still never written".',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the task and read it.
              const seen = yield* task.insert(draft);
              // Guard on the settings before anyone has written them; that guard holds.
              const untouched = yield* settings.get();
              const [, first] = yield* table.transact([
                yield* settings.unchangedOp(untouched),
                yield* task.insertOp(other),
              ]);
              // The task and the settings both change under us.
              yield* task.getAndUpdate(key, { status: 'done' });
              yield* settings.getAndUpdate({ theme: 'dark' });
              // A guard on the task as first seen now fails; the failure comes back as a value.
              const staleTask = yield* table
                .transact([
                  yield* task.unchangedOp(seen),
                  yield* task.getAndUpdateOp(
                    { taskId: 't2', boardId: 'work' },
                    { title: 'Review it (v2)' },
                  ),
                ])
                .pipe(Effect.flip);
              // So does the guard on the settings as first seen.
              const staleSettings = yield* table
                .transact([
                  yield* settings.unchangedOp(untouched),
                  yield* task.getAndUpdateOp(
                    { taskId: 't2', boardId: 'work' },
                    { title: 'Review it (v3)' },
                  ),
                ])
                .pipe(Effect.flip);
              // Read what the table kept for the second task.
              const stored = yield* task.get({ taskId: 't2', boardId: 'work' });
              yield* Story.assert(
                'a guard on never-written settings holds',
                untouched.meta._u === '' && first.value.taskId === 't2',
              );
              yield* Story.assert(
                'both stale guards fail, and the write beside them never lands',
                staleTask.reason._tag === 'TransactFailed' &&
                  staleSettings.reason._tag === 'TransactFailed' &&
                  stored?.value.title === 'Review it',
              );
              return {
                first,
                staleTask: statusesOf(staleTask),
                staleSettings: statusesOf(staleSettings),
                stored,
              };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Can a batch check a task it also writes, and what do the other ops say when one fails?',
      {
        answer:
          'No: each row may appear once in a batch, so that is refused as `DuplicateTransactionTarget` before anything runs; put the rule on the write op instead. In the report, the op that failed has the same status and detail on every database; the others read `not-evaluated` here and may read `passed` elsewhere, so decide from the failed one only.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the task and read it.
              const seen = yield* task.insert(draft);
              // Check the task and change it in one batch; the failure comes back as a value.
              const twice = yield* table
                .transact([
                  yield* task.existsOp(key),
                  yield* task.getAndUpdateOp(key, { status: 'done' }),
                ])
                .pipe(Effect.flip);
              // The task changes, then a guard on the old read fails at commit time.
              yield* task.getAndUpdate(key, { status: 'done' });
              const stale = yield* table
                .transact([
                  yield* task.unchangedOp(seen),
                  yield* task.insertOp(other),
                ])
                .pipe(Effect.flip);
              // A rule refused before commit reports differently for the ops before it.
              const refused = yield* table
                .transact([
                  yield* task.insertOp(other),
                  yield* task.getAndUpdateOp(
                    key,
                    { title: 'Never' },
                    { check: (current) => current.status === 'open' },
                  ),
                ])
                .pipe(Effect.flip);
              yield* Story.assert(
                'the same row twice is refused up front',
                twice.reason._tag === 'DuplicateTransactionTarget',
              );
              yield* Story.assert(
                'the stale guard is named, and its sibling was not evaluated',
                statusesOf(stale).join() === 'stale (updated),not-evaluated',
              );
              yield* Story.assert(
                'a refused rule is named, and the op before it had passed',
                statusesOf(refused).join() === 'passed,refused (CheckRefused)',
              );
              return {
                twice: twice.reason._tag,
                stale: statusesOf(stale),
                refused: statusesOf(refused),
              };
            }),
          ),
        ),
      },
    ),
  ],
});
