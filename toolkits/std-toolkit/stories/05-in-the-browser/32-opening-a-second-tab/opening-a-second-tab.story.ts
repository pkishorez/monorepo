import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { Story } from 'laymos/story';
import { createStdSync, syncStrategy } from 'std-toolkit/sync';
import { fresh, platform } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import {
  browserRuntime,
  changesOn,
  until,
} from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';

// Runs a program against a brand-new, empty copy of the table in memory: the server.
const onBoard = fresh('memory', table);

// Two tasks on the `work` board.
const plan = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;
const review = { ...plan, taskId: 't2', title: 'Review it' };

// How many times each tab asked the server for the board.
const reads: Record<string, number> = {};

// One browser tab: its own app on its own platform, a Task collection that can read and write, and a screen on the `work` board. `peerSync` lets tabs of one browser talk to each other; `keepReading` polls the server instead of reading once.
const openTab = (
  label: string,
  options: { readonly peerSync: boolean; readonly keepReading?: boolean },
) =>
  Effect.gen(function* () {
    const app = createStdSync({
      name: 'board-two-tabs',
      platform: platform({ peerSync: options.peerSync }),
      runtime: yield* browserRuntime,
      options: { gcTime: 1 },
    });
    const read =
      (boardId: string) => (cursor: Parameters<typeof changesOn>[1]) =>
        Effect.suspend(() => {
          reads[label] = (reads[label] ?? 0) + 1;
          return changesOn(boardId, cursor);
        });
    const tasks = app.collection({
      schema: Task,
      sync: {
        partitions: {
          boardId: (boardId) => ({
            strategy: syncStrategy.oldToNew({
              source: ({ paginated, poll }) =>
                options.keepReading
                  ? poll({
                      fetch: ({ cursor }) => read(boardId)(cursor),
                      schedule: Schedule.spaced('100 millis'),
                    })
                  : paginated({ fetch: ({ cursor }) => read(boardId)(cursor) }),
            }),
          }),
        },
      },
      onInsert: (items) => Effect.forEach(items, (item) => task.insert(item)),
      onUpdate: ({ current, updates }) =>
        task.getAndUpdate(
          { taskId: current.taskId, boardId: current.boardId },
          updates,
        ),
      onDelete: ({ current }) =>
        task.delete({ taskId: current.taskId, boardId: current.boardId }),
    });
    const screen = createLiveQueryCollection({
      query: (q) =>
        q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
      startSync: true,
      gcTime: 1,
    });
    yield* Effect.promise(() => screen.preload());
    // What the tab shows, as `id:title:status`.
    const shows = () =>
      screen.toArray.map(
        ({ taskId, title, status }) => `${taskId}:${title}:${status}`,
      );
    const close = Effect.promise(async () => {
      await screen.cleanup();
      await app.dispose();
    });
    return { label, app, tasks, screen, shows, close };
  });

export const openingASecondTab = Story.make({
  title: 'Opening a second tab',
  description:
    'The same board in two tabs of one browser: where the second tab gets its rows, how a change in one tab reaches the other, and what is lost when tabs cannot talk.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A second tab opens. What does it show, and where did it come from?',
      {
        answer:
          'The same tasks, read from the server: each tab has its own copy of the board and fills it by asking the server, not by copying the other tab. Tabs can be given a shared, durable copy instead (`platform({ store: "idb", databaseName })` here, IndexedDB in a real browser); the next chapter shows what that changes.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              for (const label in reads) delete reads[label];
              // The first tab opens and shows the board.
              const first = yield* openTab('first', { peerSync: true });
              yield* until(() => first.screen.size === 1);
              // A second tab opens.
              const second = yield* openTab('second', { peerSync: true });
              yield* until(() => second.screen.size === 1);
              const shown = { first: first.shows(), second: second.shows() };
              yield* Story.assert(
                'both tabs show the task',
                shown.first.join() === 't1:Write the plan:open' &&
                  shown.second.join() === shown.first.join(),
              );
              yield* Story.assert(
                'each tab asked the server for it itself',
                reads.first! >= 1 && reads.second! >= 1,
              );
              yield* first.close;
              yield* second.close;
              return { shown, reads: { ...reads } };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Add, change and remove in one tab. Does the other follow?',
      {
        answer:
          'Yes, through peer sync: once the server confirms a write, the tab that made it passes the confirmed task straight to the other tabs of the same browser over a `BroadcastChannel`, and they apply it as if the server had sent it. These tabs read the server only when they open, so nothing else could have told them.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              const first = yield* openTab('first', { peerSync: true });
              const second = yield* openTab('second', { peerSync: true });
              yield* until(
                () => first.screen.size === 1 && second.screen.size === 1,
              );
              // Add in the first tab; the second follows.
              yield* Effect.promise(
                () => first.tasks.insert(review).isPersisted.promise,
              );
              const added = yield* until(() => second.screen.size === 2);
              // Change in the second tab; the first follows.
              yield* Effect.promise(
                () =>
                  second.tasks.update('t1', (row) => {
                    row.status = 'done';
                  }).isPersisted.promise,
              );
              const changed = yield* until(() =>
                first.shows().includes('t1:Write the plan:done'),
              );
              // Remove in the first tab; the second follows.
              yield* Effect.promise(
                () => first.tasks.delete('t2').isPersisted.promise,
              );
              const removed = yield* until(() => second.screen.size === 1);
              // A peer message can land a beat late, so wait until both tabs settle on the same board before looking.
              const agreed = yield* until(
                () =>
                  first.shows().join() === second.shows().join() &&
                  first.shows().join() === 't1:Write the plan:done',
              );
              const shown = { first: first.shows(), second: second.shows() };
              yield* Story.assert(
                'every change reached the other tab',
                added && changed && removed,
              );
              yield* Story.assert('and the tabs agree', agreed);
              yield* first.close;
              yield* second.close;
              return shown;
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Peer sync off: do the tabs still agree eventually, and what changes?',
      {
        answer:
          'They still agree, because the server is what both tabs read from; what changes is how soon. Without peer sync the other tab shows the change only when it next asks the server (100 milliseconds here). Peer sync is a shortcut for freshness, never the source of truth.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              // Two tabs that cannot talk to each other, each asking the server every 100 milliseconds.
              const first = yield* openTab('first', {
                peerSync: false,
                keepReading: true,
              });
              const second = yield* openTab('second', {
                peerSync: false,
                keepReading: true,
              });
              yield* until(
                () => first.screen.size === 1 && second.screen.size === 1,
              );
              // Change in the first tab and wait for the server to confirm it.
              yield* Effect.promise(
                () =>
                  first.tasks.update('t1', (row) => {
                    row.status = 'done';
                  }).isPersisted.promise,
              );
              // The second tab has not heard yet.
              const rightAfter = second.shows();
              // Then it asks the server, and agrees.
              const eventually = yield* until(() =>
                second.shows().includes('t1:Write the plan:done'),
              );
              yield* Story.assert(
                'the other tab was behind right after the write',
                rightAfter.join() === 't1:Write the plan:open',
              );
              yield* Story.assert('and caught up from the server', eventually);
              const later = second.shows();
              yield* first.close;
              yield* second.close;
              return { rightAfter, later };
            }),
          ),
        ),
      },
    ),
  ],
});
