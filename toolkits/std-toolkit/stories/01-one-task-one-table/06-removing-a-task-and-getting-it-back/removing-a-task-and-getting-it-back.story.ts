import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { table } from '../02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// The task this chapter removes, and a second one that stays.
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

export const removingATaskAndGettingItBack = Story.make({
  title: 'Removing a task, and getting it back',
  description:
    'A delete marks a task rather than erasing it. That is what makes undo possible, and a separate call erases for real.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Is a deleted task gone?', {
      answer:
        'No. A delete marks the task deleted (`_d` becomes true) and leaves it in the table; a plain read still returns it, and asking for live tasks only with `excludeDeleted` hides it from reads and lists.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save two tasks.
            yield* task.insert(draft);
            yield* task.insert(other);
            // Delete the first; what comes back is the marked task.
            const deleted = yield* task.delete(key);
            // A plain read still finds it.
            const stored = yield* task.get(key);
            // A read of live tasks only does not.
            const hidden = yield* task.get(key, { excludeDeleted: true });
            // Listing live tasks on the board leaves it out too.
            const live = yield* task.query(
              'primary',
              { pk: { boardId: 'work' }, '>=': null },
              { excludeDeleted: true },
            );
            // Deleting it again simply writes a fresh mark.
            const again = yield* task.delete(key);
            yield* Story.assert(
              'the task is marked deleted but still readable',
              deleted.meta._d === true &&
                stored?.meta._d === true &&
                stored.value.title === 'Write the plan',
            );
            yield* Story.assert(
              'live-only reads and lists leave it out',
              hidden === null &&
                live.items.map(({ value }) => value.taskId).join() === 't2',
            );
            yield* Story.assert(
              'a second delete moves the stamp again',
              again.meta._u > deleted.meta._u,
            );
            return {
              deleted,
              hidden,
              live: live.items.map(({ value }) => value.taskId),
              again,
            };
          }),
        ),
      ),
    }),
    Story.question('How does it come back?', {
      answer:
        'A restore clears the mark; the task is live again with the data it had. Restoring an already-live task is not an error, it just writes it again.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the task and delete it.
            yield* task.insert(draft);
            yield* task.delete(key);
            // Bring it back.
            const restored = yield* task.restore(key);
            // Restoring it once more writes it again.
            const again = yield* task.restore(key);
            yield* Story.assert(
              'the task is live again with its data',
              restored.meta._d === false &&
                restored.value.title === 'Write the plan',
            );
            yield* Story.assert(
              'a second restore writes it again',
              again.meta._u > restored.meta._u,
            );
            return { restored, again };
          }),
        ),
      ),
    }),
    Story.question('How is a task removed for real?', {
      answer:
        'Call `hardDelete` with the key and the confirmation phrase; the phrase is part of the type, so you cannot call it by accident, and a read then returns `null`. To empty every task at once, `dangerouslyRemoveAllItems` takes the same phrase.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save two tasks.
            yield* task.insert(draft);
            yield* task.insert(other);
            // Erase the first one; the phrase is required.
            const removed = yield* task.hardDelete(
              key,
              'I KNOW WHAT I AM DOING',
            );
            // A read now finds nothing, not even a mark.
            const stored = yield* task.get(key);
            // Erase every remaining task in one go.
            const cleared = yield* task.dangerouslyRemoveAllItems(
              'I KNOW WHAT I AM DOING',
            );
            yield* Story.assert(
              'the erased task is gone, not marked',
              removed.value.title === 'Write the plan' && stored === null,
            );
            yield* Story.assert(
              'clearing removed the one task left',
              cleared.itemsDeleted === 1,
            );
            return { removed, stored, cleared };
          }),
        ),
      ),
    }),
  ],
});
