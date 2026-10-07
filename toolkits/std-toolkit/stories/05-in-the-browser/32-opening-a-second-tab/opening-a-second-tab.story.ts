import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect } from 'effect';
import { Story } from 'laymos/story';
import type { Entity } from '@kstackz/std-toolkit/core';
import {
  createStdSync,
  strategy,
  type SyncStore,
} from '@kstackz/std-toolkit/sync';
import { browserTabs, fresh, store } from '../../env.js';
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

// Every time a tab asked the server for the board, as `tab:after`, where `after` is the newest task the tab already had (`start` for none).
const reads: string[] = [];

// One browser tab: its own app on the store it is given, a Task collection that can read and write, and a screen on the `work` board. `keepReading` asks the server every 100 milliseconds instead of catching up once.
const openTab = (
  label: string,
  tabStore: SyncStore,
  options: { readonly keepReading?: boolean } = {},
) =>
  Effect.gen(function* () {
    const app = createStdSync({
      name: 'board-two-tabs',
      store: tabStore,
      runtime: yield* browserRuntime,
      options: { gcTime: 1 },
    });
    const read =
      (boardId: string) =>
      ({ after }: { readonly after: Entity<typeof Task.Type> | null }) =>
        Effect.suspend(() => {
          reads.push(`${label}:${after?.value.taskId ?? 'start'}`);
          return changesOn(boardId, after);
        });
    const tasks = app.collection(Task, {
      sync: {
        windows: {
          boardId: (boardId) =>
            options.keepReading
              ? strategy.oldToNew({
                  fetch: read(boardId),
                  pollEvery: '100 millis',
                })
              : strategy.oldToNew({ fetch: read(boardId) }),
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
      // Nothing subscribes to this screen the way a page would, so keep it
      // until the chapter cleans it up.
      gcTime: 60_000,
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
    'The same board in two tabs of one browser: where the second tab gets its rows, how a change in one tab reaches the other, and what changes when tabs share nothing.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A second tab opens. What does it show, and where did it come from?',
      {
        answer:
          "The same tasks, straight from the browser's own copy. Tabs of one browser share one store (IndexedDB in a real browser; `browserTabs()` from `env.ts` builds one in memory here), so the first tab's reading is already there when the second tab opens. The second tab only asks the server for what is newer than the newest task it already has. A tab with a store of its own (`store()`) has nothing to start from and reads the whole board again.",
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              reads.length = 0;
              // One browser; the first tab opens and shows the board.
              const browser = browserTabs();
              const first = yield* openTab('first', browser.tab());
              yield* until(() => first.screen.size === 1);
              // A second tab of the same browser opens.
              const second = yield* openTab('second', browser.tab());
              const atOnce = second.shows();
              // And a tab with a store of its own, for comparison.
              const alone = yield* openTab('alone', store());
              yield* until(() => alone.screen.size === 1);
              yield* Effect.sleep('30 millis');
              const shown = { first: first.shows(), second: atOnce };
              yield* Story.assert(
                'the second tab showed the task the moment it opened',
                shown.first.join() === 't1:Write the plan:open' &&
                  shown.second.join() === shown.first.join(),
              );
              yield* Story.assert(
                'it asked the server only for what came after it',
                reads.includes('first:start') &&
                  reads
                    .filter((read) => read.startsWith('second:'))
                    .every((read) => read === 'second:t1'),
              );
              yield* Story.assert(
                'the tab with a store of its own read the board from the start',
                reads.includes('alone:start'),
              );
              yield* first.close;
              yield* second.close;
              yield* alone.close;
              return { shown, reads: [...reads] };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Add, change and remove in one tab. Does the other follow?',
      {
        answer:
          'Yes, through the shared store. Once the server confirms a write, the tab that made it saves the confirmed task in the store and rings a doorbell: a signal to the other tabs that carries no data, only "look again". They re-read the store and show the change. These tabs read the server only when they open, so nothing else could have told them.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              reads.length = 0;
              const browser = browserTabs();
              const first = yield* openTab('first', browser.tab());
              const second = yield* openTab('second', browser.tab());
              yield* until(
                () => first.screen.size === 1 && second.screen.size === 1,
              );
              const readsBefore = reads.length;
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
              // The doorbell can land a beat late, so wait until both tabs settle on the same board before looking.
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
              yield* Story.assert(
                'the tabs agree, and neither asked the server again',
                agreed && reads.length === readsBefore,
              );
              yield* first.close;
              yield* second.close;
              return shown;
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Tabs that share nothing: do they still agree eventually, and what changes?',
      {
        answer:
          'They still agree, because the server is what both tabs read from; what changes is how soon. With a store each and no doorbell, the other tab shows the change only when it next asks the server (100 milliseconds here), and every tab does its own reading. The shared store and the doorbell are a shortcut for freshness, never the source of truth.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              // Two tabs that share nothing, each asking the server every 100 milliseconds.
              const first = yield* openTab('first', store(), {
                keepReading: true,
              });
              const second = yield* openTab('second', store(), {
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
