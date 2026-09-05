import { Effect, Fiber, Stream } from 'effect';
import { Story } from 'laymos/story';
import { defaultBroadcaster } from 'std-toolkit/core';
import { fresh } from '../../env.js';
import {
  table,
  task,
} from '../10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { settings } from '../12-one-record-that-exists-exactly-once/one-record-that-exists-exactly-once.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// A task for each of Ana and Ben, on the `work` board.
const draft = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: 'ana',
  colour: 'blue',
  notes: '',
} as const;
const forBen = {
  ...draft,
  taskId: 't2',
  title: 'Review it',
  assignee: 'ben',
} as const;

export const beingToldWhenATaskChanges = Story.make({
  title: 'Being told when a task changes',
  description:
    'A stream of change notices instead of asking again and again: for one kind of thing, for the tasks that match a filter, or for the whole table.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('A task is saved. Does a subscriber hear about it?', {
      answer:
        'Yes, if something is there to relay changes: `defaultBroadcaster` is the in-process relay, and once it is provided `task.subscribe()` is a stream that delivers a change notice (the stored task, exactly as the write returned it) the moment a write lands. With no relay provided the stream is simply empty; nothing waits and nothing fails.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // With nothing to relay changes, a subscription ends at once, empty.
            const unheard = yield* Stream.runCollect(task.subscribe());
            // With the relay in place: start listening for one change, then save a task.
            const heard = yield* Effect.gen(function* () {
              const listening = yield* Effect.forkChild(
                Stream.runCollect(task.subscribe().pipe(Stream.take(1))),
                { startImmediately: true },
              );
              const inserted = yield* task.insert(draft);
              const [notice] = yield* Fiber.join(listening);
              return { inserted, notice };
            }).pipe(Effect.provide(defaultBroadcaster));
            yield* Story.assert(
              'without a relay the stream is empty',
              unheard.length === 0,
            );
            yield* Story.assert(
              'with one, the notice is the very task the save returned',
              heard.notice?.value.title === 'Write the plan' &&
                heard.notice.meta._u === heard.inserted.meta._u,
            );
            return { unheard: unheard.length, ...heard };
          }),
        ),
      ),
    }),
    Story.question('Can I hear about only the tasks I care about?', {
      answer:
        'Give `subscribe` a partial task, and only writes whose result matches every field of it are delivered. The match is on each write as it lands, not on the task over time: when an update moves a task away from the filter, that write and later ones to it are not delivered.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Listen for two changes to tasks assigned to Ana.
            const listening = yield* Effect.forkChild(
              Stream.runCollect(
                task.subscribe({ assignee: 'ana' }).pipe(Stream.take(2)),
              ),
              { startImmediately: true },
            );
            // Ben's task: not for Ana, not delivered.
            yield* task.insert(forBen);
            // Ana's task: delivered.
            yield* task.insert(draft);
            // Ana hands it to Ben: the write no longer matches, so it is not delivered.
            yield* task.getAndUpdate(
              { taskId: 't1', boardId: 'work' },
              { assignee: 'ben' },
            );
            // A new task for Ana: delivered.
            yield* task.insert({ ...draft, taskId: 't3', title: 'Send it' });
            const notices = yield* Fiber.join(listening);
            const heard = notices.map(({ value }) => value.taskId);
            yield* Story.assert(
              "only Ana's writes arrived, and the hand-over did not",
              heard.join() === 't1,t3',
            );
            return { heard };
          }).pipe(Effect.provide(defaultBroadcaster)),
        ),
      ),
    }),
    Story.question('Can I hear about everything in the table?', {
      answer:
        'Yes: `table.subscribe()` delivers every change notice from every kind of thing the table holds, tasks and settings alike. Because no single shape fits them all, each notice is untyped, and `meta._e` says what kind it is.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Listen for two changes of any kind.
            const listening = yield* Effect.forkChild(
              Stream.runCollect(table.subscribe().pipe(Stream.take(2))),
              { startImmediately: true },
            );
            // Save a task, then change the settings.
            yield* task.insert(draft);
            yield* settings.put({ theme: 'dark', perPage: 10 });
            const notices = yield* Fiber.join(listening);
            const kinds = notices.map(({ meta }) => meta._e);
            yield* Story.assert(
              'both the task and the settings arrived on one stream',
              kinds.join() === 'Task,Settings',
            );
            return { kinds };
          }).pipe(Effect.provide(defaultBroadcaster)),
        ),
      ),
    }),
  ],
});
