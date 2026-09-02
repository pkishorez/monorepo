import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { table } from '../02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The task this chapter edits, and the key that finds it.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

export const changingPartOfATask = Story.make({
  title: 'Changing part of a task',
  description:
    'Edit some fields of a saved task without reading the whole task into your own code first.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do I change only the title?', {
      answer:
        'Give the update the key and just the fields that change; the other fields keep their values and the update stamp moves forward. Updating a task that was never saved fails with `NoItemToUpdate` rather than creating it.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the task.
            const inserted = yield* task.insert(draft);
            // Change the title and nothing else.
            const updated = yield* task.getAndUpdate(key, {
              title: 'Write the plan (v2)',
            });
            // Try the same edit on a task that does not exist; the failure comes back as a value.
            const missing = yield* task
              .getAndUpdate(
                { taskId: 'nope', boardId: 'work' },
                { title: 'Never saved' },
              )
              .pipe(Effect.flip);
            yield* Story.assert(
              'the title changed and the other fields stayed',
              updated.value.title === 'Write the plan (v2)' &&
                updated.value.status === 'open' &&
                updated.value.colour === 'blue',
            );
            yield* Story.assert(
              'the update stamp moved forward',
              updated.meta._u > inserted.meta._u,
            );
            yield* Story.assert(
              'a missing task is not created',
              missing.reason._tag === 'NoItemToUpdate',
            );
            return { updated, missing: missing.reason._tag };
          }),
        ),
      ),
    }),
    Story.question('What if the new value depends on the old one?', {
      answer:
        'Pass a function instead of an object; it receives the task as just read and returns the fields to change. To stop a write that would change nothing, add a `check` on the current value: when it says no, nothing is written and the stamp stays put.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the task.
            yield* task.insert(draft);
            // Compute the new title from the current one.
            const updated = yield* task.getAndUpdate(key, (current) => ({
              title: `${current.title} (reviewed)`,
            }));
            // Only mark it done if it is not already; here it isn't, so the write happens.
            const done = yield* task.getAndUpdate(
              key,
              { status: 'done' },
              { check: (current) => current.status !== 'done' },
            );
            // The same edit again is refused by the check, and nothing is written.
            const skipped = yield* task
              .getAndUpdate(
                key,
                { status: 'done' },
                { check: (current) => current.status !== 'done' },
              )
              .pipe(Effect.flip);
            // Read what the table kept.
            const stored = yield* task.get(key);
            yield* Story.assert(
              'the new title was built from the old one',
              updated.value.title === 'Write the plan (reviewed)',
            );
            yield* Story.assert(
              'the refused edit left the stamp alone',
              skipped.reason._tag === 'CheckRefused' &&
                stored?.meta._u === done.meta._u,
            );
            return { updated, done, skipped: skipped.reason._tag, stored };
          }),
        ),
      ),
    }),
    Story.question(
      'Can I move a task to another board by changing `boardId`?',
      {
        answer:
          "No: `boardId` and `taskId` are the task's key, so an update that changes either fails with `PrimaryKeyUpdateNotSupported` and the stored task is untouched. To move a task, save it under the new key and remove the old one.",
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the task.
              const inserted = yield* task.insert(draft);
              // Try to change the board; the failure comes back as a value.
              const boardFailure = yield* task
                .getAndUpdate(key, { boardId: 'home' })
                .pipe(Effect.flip);
              // Try to change the id; same result.
              const idFailure = yield* task
                .getAndUpdate(key, { taskId: 't2' })
                .pipe(Effect.flip);
              // Read what the table kept.
              const stored = yield* task.get(key);
              yield* Story.assert(
                'changing either key field is refused',
                boardFailure.reason._tag === 'PrimaryKeyUpdateNotSupported' &&
                  idFailure.reason._tag === 'PrimaryKeyUpdateNotSupported',
              );
              yield* Story.assert(
                'the stored task did not move or change',
                stored?.value.boardId === 'work' &&
                  stored.meta._u === inserted.meta._u,
              );
              return {
                board: boardFailure.reason._tag,
                id: idFailure.reason._tag,
                stored,
              };
            }),
          ),
        ),
      },
    ),
  ],
});
