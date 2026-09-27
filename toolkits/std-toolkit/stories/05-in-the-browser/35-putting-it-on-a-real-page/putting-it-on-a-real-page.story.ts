import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import {
  createStdSync,
  strategy,
  type SyncEvent,
} from '@kstackz/std-toolkit/sync';
import {
  browser,
  deleteStdSync,
  listStdSyncs,
} from '@kstackz/std-toolkit/sync/platform/browser';
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

// Node plays the browser here: Web Locks and `BroadcastChannel` are built in, and IndexedDB comes from `fake-indexeddb`, which `env.ts` installs.

// Runs `build` while the page's `BroadcastChannel` is `channel`; `undefined` plays a browser without one.
const withBroadcastChannel = <A>(channel: unknown, build: () => A): A => {
  const host = globalThis as { BroadcastChannel?: unknown };
  const original = host.BroadcastChannel;
  if (channel === undefined) delete host.BroadcastChannel;
  else host.BroadcastChannel = channel;
  try {
    return build();
  } finally {
    host.BroadcastChannel = original;
  }
};

// Every reader a tab opened on the server, in order, as `tab:after`, where `after` is the newest task it already had (`start` for none).
const readers: string[] = [];

// One tab on the real platform: its app, a Task collection read through the pushed changes from chapter 28, and a screen on the `work` board. Every event sync reports lands in `events`.
const openTab = (label: string, name: string) =>
  Effect.gen(function* () {
    const events: SyncEvent['_tag'][] = [];
    const app = createStdSync({
      name,
      platform: browser(),
      runtime: yield* pushingRuntime,
      options: { gcTime: 1 },
      onEvent: (event) => Effect.sync(() => void events.push(event._tag)),
    });
    const tasks = app.collection(Task, {
      sync: {
        partitions: {
          boardId: (boardId) =>
            strategy.oldToNew({
              subscribe: ({ after }) =>
                Stream.suspend(() => {
                  readers.push(`${label}:${after?.value.taskId ?? 'start'}`);
                  return pushedChanges(boardId, after);
                }),
            }),
        },
      },
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
    const close = Effect.promise(async () => {
      await screen.cleanup();
      await app.dispose();
    });
    return { app, screen, events, close };
  });

export const puttingItOnARealPage = Story.make({
  title: 'Putting it on a real page',
  description:
    'The whole board on the ready-made browser platform: what it bundles, how to watch what sync is doing, two real tabs handing the reading over, and what logging out clears.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does the real-browser platform bundle?', {
      answer:
        "Everything the chapters stood in for: `browser()` keeps the copy in IndexedDB (a database per app, named `std-sync:` and the app's name), lets tabs take turns reading with Web Locks, and rings the doorbell over `BroadcastChannel`. Each piece can be turned off (`leadership: false`, `doorbell: false`), and a piece the browser lacks falls back to none instead of failing. The app is then one call, with the same collections as before.",
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            // The platform, the same with its sharing turned off, and the same in a browser without `BroadcastChannel`.
            const real = browser();
            const bare = browser({ leadership: false, doorbell: false });
            const older = withBroadcastChannel(undefined, () => browser());
            const bundled = {
              leadership: real.leadership !== bare.leadership,
              doorbell: real.doorbell !== bare.doorbell,
            };
            const inOlderBrowser = {
              leadership: older.leadership !== bare.leadership,
              doorbell: older.doorbell !== bare.doorbell,
            };
            // The whole app on it.
            const app = createStdSync({
              name: 'board-on-a-page',
              platform: real,
              runtime: yield* browserRuntime,
              options: { gcTime: 1 },
            });
            const tasks = app.collection(Task, {
              sync: {
                partitions: {
                  boardId: (boardId) =>
                    strategy.oldToNew({
                      fetch: ({ after }) => changesOn(boardId, after),
                      pollEvery: '20 millis',
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
              // Nothing subscribes to this screen the way a page would, so keep it
              // until the chapter cleans it up.
              gcTime: 60_000,
            });
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            const shown = screen.toArray.map(
              ({ taskId, title }) => `${taskId}:${title}`,
            );
            // The browser now holds a database for this app.
            const stored = yield* Effect.promise(() => listStdSyncs());
            yield* Story.assert(
              'leadership and the doorbell came bundled, and only the missing one fell back to none',
              bundled.leadership &&
                bundled.doorbell &&
                inOlderBrowser.leadership &&
                !inOlderBrowser.doorbell,
            );
            yield* Story.assert(
              'the board showed, kept in its own IndexedDB database',
              shown.join() === 't1:Write the plan' &&
                stored.some(
                  ({ name, databaseName }) =>
                    name === 'board-on-a-page' &&
                    databaseName === 'std-sync:board-on-a-page',
                ),
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            yield* Effect.promise(() => deleteStdSync(app.name));
            return { bundled, inOlderBrowser, shown, stored };
          }),
        ),
      ),
    }),
    Story.question('How do I watch what sync is doing?', {
      answer:
        'Give the app an `onEvent`. It is called with every notable thing sync fails at or runs into, as a tagged value: `SessionFailed` when a read of the server fails (it is tried again anyway), `OutdatedApplication` when the server sends data newer than this code understands, and `PlatformClosed` when the stored copy was deleted from elsewhere. Without it, events go to the Effect logger.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            // Every event sync reports.
            const events: SyncEvent[] = [];
            const app = createStdSync({
              name: 'board-events',
              platform: browser(),
              runtime: yield* browserRuntime,
              options: { gcTime: 1 },
              onEvent: (event) => Effect.sync(() => void events.push(event)),
            });
            // The server is down for the first read.
            let reads = 0;
            const tasks = app.collection(Task, {
              sync: {
                partitions: {
                  boardId: (boardId) =>
                    strategy.oldToNew({
                      fetch: ({ after }) =>
                        ++reads === 1
                          ? Effect.fail('server down')
                          : changesOn(boardId, after),
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
              // Nothing subscribes to this screen the way a page would, so keep it
              // until the chapter cleans it up.
              gcTime: 60_000,
            });
            yield* Effect.promise(() => screen.preload());
            // The retry comes a second later.
            const shown = yield* until(() => screen.size === 1);
            const seen = events.map((event) =>
              event._tag === 'SessionFailed'
                ? {
                    _tag: event._tag,
                    collection: event.collection,
                    strategy: event.strategy,
                    cause: String(event.cause),
                  }
                : { _tag: event._tag },
            );
            yield* Story.assert(
              'the failed read was reported, with where it happened',
              seen.length === 1 &&
                seen[0]?._tag === 'SessionFailed' &&
                seen[0].collection === 'board-events.task' &&
                seen[0].strategy === 'old-to-new',
            );
            yield* Story.assert('and the retry showed the board', shown);
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            yield* Effect.promise(() => deleteStdSync(app.name));
            return { seen };
          }),
        ),
      ),
    }),
    Story.question(
      'Two real tabs, and the one doing the reading closes. Who reads now?',
      {
        answer:
          'The other one. Web Locks give the reading to one tab, and the browser releases the lock when that tab closes or crashes, so the waiting tab takes over from where the first one got to. Both tabs share one IndexedDB copy, so the second tab starts from what the first already read, and the doorbell over `BroadcastChannel` tells it when the first saves more.',
        proof: onPushingBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              readers.length = 0;
              const first = yield* openTab('first', 'board-tabs');
              yield* until(
                () => readers.length === 1 && first.screen.size === 1,
              );
              const second = yield* openTab('second', 'board-tabs');
              yield* until(() => second.screen.size === 1);
              // The server saves a task while the first tab reads; the second hears the doorbell.
              yield* task.insert({ ...plan, taskId: 't2', title: 'Review it' });
              const heard = yield* until(() => second.screen.size === 2);
              const beforeClosing = [...readers];
              // The first tab closes.
              yield* first.close;
              const handedOver = yield* until(() => readers.length === 2);
              yield* task.insert({ ...plan, taskId: 't3', title: 'Send it' });
              const kept = yield* until(() => second.screen.size === 3);
              yield* Story.assert(
                'the second tab showed what the first read, without reading',
                beforeClosing.join() === 'first:start' && heard,
              );
              yield* Story.assert(
                'closing the first tab handed the reading to the second, from where the first got to',
                handedOver && readers[1] === 'second:t2' && kept,
              );
              yield* second.close;
              yield* Effect.promise(() => deleteStdSync('board-tabs'));
              return { beforeClosing, afterClosing: [...readers] };
            }),
          ),
        ),
      },
    ),
    Story.question('Someone logs out. What is cleared?', {
      answer:
        "Nothing, until the app says so: disposing an app stops its sync and keeps its copy, ready for next time. Logging out is `await app.dispose()` and then `await deleteStdSync(app.name)`, which deletes that app's IndexedDB database. Any other tab still running the same app is told first; it stops and reports `PlatformClosed`. `listStdSyncs()` shows which apps have a copy in this browser.",
      proof: onPushingBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            const here = yield* openTab('here', 'board-logout');
            const there = yield* openTab('there', 'board-logout');
            yield* until(
              () => here.screen.size === 1 && there.screen.size === 1,
            );
            const namesOf = Effect.promise(() => listStdSyncs()).pipe(
              Effect.map((stored) => stored.map(({ name }) => name)),
            );
            const before = yield* namesOf;
            // Log out in this tab.
            yield* Effect.promise(async () => {
              await here.screen.cleanup();
              await here.app.dispose();
              await deleteStdSync(here.app.name);
            });
            const told = yield* until(() =>
              there.events.includes('PlatformClosed'),
            );
            const after = yield* namesOf;
            yield* Story.assert(
              'the copy was listed before and gone after',
              before.includes('board-logout') &&
                !after.includes('board-logout'),
            );
            yield* Story.assert(
              'the other tab was told and stopped',
              told && there.events.join() === 'PlatformClosed',
            );
            yield* there.close;
            return { before, after, there: there.events };
          }),
        ),
      ),
    }),
  ],
});
