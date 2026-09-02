import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule, Stream } from 'effect';
import { Story } from 'laymos/story';
import { createStdSync, syncStrategy, type SyncEvent } from 'std-toolkit/sync';
import { browser } from 'std-toolkit/sync/platform/browser';
import { fresh } from '../../env.js';
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
import {
  browserRuntime as pushingRuntime,
  onBoard as onPushingBoard,
  pushedChanges,
} from '../28-catching-up-on-what-you-missed/catching-up-on-what-you-missed.story.js';

// Runs a program against a brand-new, empty copy of the table in memory: the server.
const onBoard = fresh('memory', table);

const plan = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// Node has no `document`. This is a tab's, in miniature: whether it is visible, and the event a page fires when that changes. Each tab gets its own.
const tabDocument = () => {
  const listeners = new Set<() => void>();
  const tab = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
    hide: () => {
      tab.visibilityState = 'hidden';
      for (const listener of listeners) listener();
    },
    show: () => {
      tab.visibilityState = 'visible';
      for (const listener of listeners) listener();
    },
  };
  return tab;
};

// The real platform reads `document` when it is built, so a tab installs its own first. Web Locks come from Node itself, IndexedDB from `fake-indexeddb`, and `BroadcastChannel` is built in.
const realPlatform = (databaseName: string, document = tabDocument()) => {
  const host = globalThis as { document?: unknown };
  host.document = document;
  try {
    return browser({ databaseName });
  } finally {
    delete host.document;
  }
};

// Which tabs opened a reader on the server, in order.
const readers: string[] = [];

export const puttingItOnARealPage = Story.make({
  title: 'Putting it on a real page',
  description:
    'The whole board on the ready-made browser platform: what it bundles, how to watch what sync is doing, and two real tabs handing the reading over.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does the real-browser platform bundle?', {
      answer:
        'Everything the chapters built by hand: `browser()` keeps the copy in IndexedDB (a database per app name unless you give one), lets tabs agree on a reader with Web Locks, links tabs over `BroadcastChannel`, and reports the network from `navigator.onLine` when the page has one. The app is then one call, with the same collections as before.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            // The platform, and what it came with.
            const real = realPlatform('board-page');
            const bundled = {
              store: real.storeLayer !== undefined,
              leadership: real.leadershipLayer !== undefined,
              peerSync: real.peerSync !== undefined,
              connectivity: real.connectivity !== undefined,
            };
            // The whole app on it.
            const app = createStdSync({
              name: 'board-on-a-page',
              platform: real,
              runtime: yield* browserRuntime,
              options: { gcTime: 1 },
            });
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({
                    strategy: syncStrategy.oldToNew({
                      source: ({ poll }) =>
                        poll({
                          fetch: ({ cursor }) => changesOn(boardId, cursor),
                          schedule: Schedule.spaced('20 millis'),
                        }),
                    }),
                  }),
                },
              },
            });
            const screen = createLiveQueryCollection({
              query: (q) =>
                q
                  .from({ task: tasks })
                  .where(({ task }) => eq(task.boardId, 'work')),
              startSync: true,
              gcTime: 1,
            });
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            const shown = screen.toArray.map(
              ({ taskId, title }) => `${taskId}:${title}`,
            );
            yield* Story.assert(
              'store, leadership and peer sync came bundled; the network signal needs a real page',
              bundled.store &&
                bundled.leadership &&
                bundled.peerSync &&
                !bundled.connectivity,
            );
            yield* Story.assert(
              'the board showed on the real platform',
              shown.join() === 't1:Write the plan',
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { bundled, shown };
          }),
        ),
      ),
    }),
    Story.question('How do I watch what sync is doing?', {
      answer:
        'Give the app an `onEvent`: it is called with every notable thing sync does or fails to do, as a tagged value, such as leadership moving between tabs, a peer message that could not be delivered, or a screen asking for something no reading recipe serves. Without it, events go to the Effect logger.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            // Every event sync reports, by tag.
            const events: SyncEvent['_tag'][] = [];
            const app = createStdSync({
              name: 'board-on-a-page',
              platform: realPlatform('board-events'),
              runtime: yield* browserRuntime,
              options: { gcTime: 1 },
              onEvent: (event) =>
                Effect.sync(() => void events.push(event._tag)),
            });
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({
                    strategy: syncStrategy.oldToNew({
                      source: ({ poll }) =>
                        poll({
                          fetch: ({ cursor }) => changesOn(boardId, cursor),
                          schedule: Schedule.spaced('20 millis'),
                        }),
                    }),
                  }),
                },
              },
            });
            // A screen for the work board, and one that asks for every task, which no recipe serves.
            const work = createLiveQueryCollection({
              query: (q) =>
                q
                  .from({ task: tasks })
                  .where(({ task }) => eq(task.boardId, 'work')),
              startSync: true,
              gcTime: 1,
            });
            const everything = createLiveQueryCollection({
              query: (q) => q.from({ task: tasks }),
              startSync: true,
              gcTime: 1,
            });
            yield* Effect.promise(() => work.preload());
            yield* Effect.promise(() => everything.preload());
            yield* until(
              () => work.size === 1 && events.includes('UnservedQuery'),
            );
            const seen = [...new Set(events)];
            yield* Story.assert(
              'the unserved screen and the leadership hand-shake were reported',
              seen.includes('UnservedQuery') &&
                seen.includes('LeadershipChanged'),
            );
            yield* Effect.promise(() => work.cleanup());
            yield* Effect.promise(() => everything.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { seen };
          }),
        ),
      ),
    }),
    Story.question(
      'Two real tabs, and the one doing the reading is hidden. Who reads now?',
      {
        answer:
          'The other one. Web Locks leadership gives the reading to one tab and hands it over when that tab is closed, or hidden, or frozen by the browser, so the tab the person is looking at is the one talking to the server. Both tabs share one IndexedDB copy, so the second tab starts from what the first already read.',
        proof: onPushingBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              readers.length = 0;
              // One tab: its document, its app on the shared database, its screen, read through the pushed changes from chapter 28.
              const openTab = (label: string) =>
                Effect.gen(function* () {
                  const document = tabDocument();
                  const app = createStdSync({
                    name: 'board-on-a-page',
                    platform: realPlatform('board-tabs', document),
                    runtime: yield* pushingRuntime,
                    options: { gcTime: 1 },
                  });
                  const tasks = app.collection({
                    schema: Task,
                    sync: {
                      partitions: {
                        boardId: (boardId) => ({
                          strategy: syncStrategy.oldToNew({
                            source: ({ live }) =>
                              live({
                                open: ({ cursor }) =>
                                  Stream.suspend(() => {
                                    readers.push(label);
                                    return pushedChanges(boardId, cursor);
                                  }),
                              }),
                          }),
                        }),
                      },
                    },
                  });
                  const screen = createLiveQueryCollection({
                    query: (q) =>
                      q
                        .from({ task: tasks })
                        .where(({ task }) => eq(task.boardId, 'work')),
                    startSync: true,
                    gcTime: 1,
                  });
                  yield* Effect.promise(() => screen.preload());
                  const close = Effect.promise(async () => {
                    await screen.cleanup();
                    await app.dispose();
                  });
                  return { document, screen, close };
                });
              const first = yield* openTab('first');
              yield* until(
                () => readers.length === 1 && first.screen.size === 1,
              );
              const second = yield* openTab('second');
              yield* until(() => second.screen.size === 1);
              const beforeHiding = [...readers];
              // The first tab is hidden.
              first.document.hide();
              const handedOver = yield* until(() => readers.length === 2);
              yield* Story.assert(
                'the second tab started from the shared copy without reading',
                beforeHiding.join() === 'first',
              );
              yield* Story.assert(
                'hiding the first tab handed the reading to the second',
                handedOver && readers.join() === 'first,second',
              );
              yield* first.close;
              yield* second.close;
              return { beforeHiding, afterHiding: readers };
            }),
          ),
        ),
      },
    ),
  ],
});
