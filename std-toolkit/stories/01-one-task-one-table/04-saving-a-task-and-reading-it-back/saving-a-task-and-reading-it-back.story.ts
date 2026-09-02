import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { table } from '../02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The task this chapter saves, and the key that finds it again.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

export const savingATaskAndReadingItBack = Story.make({
  title: 'Saving a task and reading it back',
  description:
    'The first write and the first read: what a save returns, what a read of a missing task returns, and what a second save of the same task does.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What do I get back when I save a task?', {
      answer:
        'The stored task: your `value` exactly as saved, plus `meta`, the few facts the table keeps beside it (`_e` says it is a Task, `_d` says it is live, `_u` is the update stamp that moves on every write). Reading it back returns the same two parts.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the task; what comes back is the stored task.
            const inserted = yield* task.insert(draft);
            // Read it back by its key.
            const stored = yield* task.get(key);
            yield* Story.assert(
              'the saved task is stamped as a live Task',
              inserted.meta._e === 'Task' && inserted.meta._d === false,
            );
            yield* Story.assert(
              'reading it back gives the same task and stamp',
              stored?.value.title === 'Write the plan' &&
                stored.meta._u === inserted.meta._u,
            );
            return { inserted, stored };
          }),
        ),
      ),
    }),
    Story.question('What comes back for a task that was never saved?', {
      answer: '`null`. A missing task is a value you check for, not a failure.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Read a key nothing was ever saved under.
            const missing = yield* task.get({
              taskId: 'nope',
              boardId: 'work',
            });
            yield* Story.assert(
              'a missing task reads as null',
              missing === null,
            );
            return { missing };
          }),
        ),
      ),
    }),
    Story.question('What if I save the same task twice?', {
      answer:
        'The second save fails with `ItemAlreadyExists` and the first one is untouched. A save never overwrites a task that is already there; changing one is the next chapter.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the task once.
            yield* task.insert(draft);
            // Save it again with a new title; the failure comes back as a value.
            const failure = yield* task
              .insert({ ...draft, title: 'Overwritten' })
              .pipe(Effect.flip);
            // Read what the table kept.
            const stored = yield* task.get(key);
            yield* Story.assert(
              'the second save is refused',
              failure.reason._tag === 'ItemAlreadyExists',
            );
            yield* Story.assert(
              'the first save survives',
              stored?.value.title === 'Write the plan',
            );
            return { reason: failure.reason._tag, stored };
          }),
        ),
      ),
    }),
  ],
});
