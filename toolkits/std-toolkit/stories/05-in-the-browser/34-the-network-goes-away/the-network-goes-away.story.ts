import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { Story } from 'laymos/story';
import {
  createStdSync,
  strategy,
  type SyncEvent,
} from '@kstackz/std-toolkit/sync';
import { fresh, store } from '../../env.js';
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

// The network, as a switch the proof flips. Offline, every call to the server fails.
const network = { online: true };
const overTheNetwork = <A, E, R>(call: Effect.Effect<A, E, R>) =>
  Effect.suspend((): Effect.Effect<A, E | 'no network', R> =>
    network.online ? call : Effect.fail('no network'),
  );

// When each read of the server started, in milliseconds.
const attempts: number[] = [];

// Each proof gets a browser of its own: a durable (fake IndexedDB) store under a name no other proof uses.
let browsers = 0;
const newBrowser = () => `board-offline-${++browsers}`;

// Waits like `until` from chapter 25, but for up to six seconds: long enough to sit through a retry or two.
const untilLater = (check: () => boolean) =>
  Effect.sync(check).pipe(
    Effect.repeat({
      schedule: Schedule.spaced('20 millis'),
      until: (passed) => passed,
      times: 300,
    }),
  );

// One page load: an app whose copy lives in the browser's durable store, a Task collection that reads and writes over the network switch, and a screen on the `work` board. Every event sync reports lands in `events`.
const openPage = (databaseName: string) =>
  Effect.gen(function* () {
    const events: SyncEvent[] = [];
    const app = createStdSync({
      name: 'board-offline',
      store: store({ kind: 'idb', databaseName }),
      runtime: yield* browserRuntime,
      options: { gcTime: 1 },
      onEvent: (event) => Effect.sync(() => void events.push(event)),
    });
    const tasks = app.collection(Task, {
      sync: {
        windows: {
          boardId: (boardId) =>
            strategy.oldToNew({
              fetch: ({ after }) =>
                Effect.suspend(() => {
                  attempts.push(Date.now());
                  return overTheNetwork(changesOn(boardId, after));
                }),
            }),
        },
      },
      onUpdate: ({ current, updates }) =>
        overTheNetwork(
          task.getAndUpdate(
            { taskId: current.taskId, boardId: current.boardId },
            updates,
          ),
        ),
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
    // What the page shows, as `id:status`.
    const shows = () =>
      screen.toArray.map(({ taskId, status }) => `${taskId}:${status}`);
    const close = Effect.promise(async () => {
      await screen.cleanup();
      await app.dispose();
    });
    return { tasks, screen, shows, events, close };
  });

// Yesterday: the page opened online, read the board into the browser's store, and closed.
const visitedYesterday = (databaseName: string) =>
  Effect.gen(function* () {
    network.online = true;
    const page = yield* openPage(databaseName);
    yield* until(() => page.screen.size === 2);
    yield* page.close;
  });

export const theNetworkGoesAway = Story.make({
  title: 'The network goes away',
  description:
    'A page with no network: what it shows when it opens, what sync does while the server is out of reach, and what happens to an edit made in the meantime.',
  spine: true,
  sourceUrl: import.meta.url,
  timeout: '30 seconds',
  questions: [
    Story.question(
      'The page opens with no network. What does the board show?',
      {
        answer:
          'What it showed last time. The collection fills the screen from the browser\'s own copy before it asks the server anything, so the board is there even though that first read fails. The copy has to be durable for this: IndexedDB in a real browser, a fake one here (`store({ kind: "idb", databaseName })`); a copy in memory is gone when the page closes.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              yield* task.insert(review);
              const browser = newBrowser();
              yield* visitedYesterday(browser);
              // Today the network is gone before the page opens.
              network.online = false;
              const page = yield* openPage(browser);
              const atOnce = page.shows();
              // Wait until the page has tried the server and failed.
              yield* until(() => page.events.length > 0);
              const failed = page.events.map(({ _tag }) => _tag);
              yield* Story.assert(
                'the board showed both tasks the moment the page opened',
                atOnce.join() === 't1:open,t2:open',
              );
              yield* Story.assert(
                'the read from the server failed, and the board stayed',
                failed[0] === 'SessionFailed' && page.screen.size === 2,
              );
              yield* page.close;
              network.online = true;
              return { atOnce, failed };
            }),
          ),
        ),
      },
    ),
    Story.question('The server stays out of reach. Does sync give up?', {
      answer:
        'No. Each failed read is reported to `onEvent` as `SessionFailed` and tried again from where the copy got to, after a delay that doubles each time: one second, then two, then four, up to thirty. The screen keeps what it has meanwhile. Once the network is back, the next try catches up on everything the server saved while the page was cut off.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            yield* task.insert(review);
            const browser = newBrowser();
            yield* visitedYesterday(browser);
            // Offline; meanwhile someone saves a third task on the server.
            network.online = false;
            yield* task.insert({ ...plan, taskId: 't3', title: 'Send it' });
            attempts.length = 0;
            const page = yield* openPage(browser);
            // Two tries fail.
            yield* untilLater(() => page.events.length === 2);
            const whileOffline = page.shows();
            // The network is back.
            network.online = true;
            const caughtUp = yield* untilLater(() => page.screen.size === 3);
            const gaps = [
              attempts[1]! - attempts[0]!,
              attempts[2]! - attempts[1]!,
            ];
            yield* Story.assert(
              'two failures were reported, and the board stayed meanwhile',
              page.events.every(({ _tag }) => _tag === 'SessionFailed') &&
                whileOffline.join() === 't1:open,t2:open',
            );
            yield* Story.assert(
              'the second wait was about twice the first',
              gaps[0]! >= 900 && gaps[1]! >= 1.5 * gaps[0]!,
            );
            yield* Story.assert(
              'once back online, the next try brought in the new task',
              caughtUp,
            );
            const shown = page.shows();
            yield* page.close;
            return { whileOffline, gaps, shown };
          }),
        ),
      ),
    }),
    Story.question('An edit while offline: is it kept for later?', {
      answer:
        "No, not in this version. The edit shows at once as not yet confirmed; then the collection's `onUpdate` tries the server, fails, and TanStack DB rolls the edit back off the screen, so the page never claims a change the server does not have. The app hears about it through the write's `isPersisted` promise, which rejects. Keeping writes until the network returns (an outbox) is planned for a later version.",
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            yield* task.insert(review);
            network.online = true;
            const page = yield* openPage(newBrowser());
            yield* until(() => page.screen.size === 2);
            // The network goes away.
            network.online = false;
            // Mark a task done.
            const edit = page.tasks.update('t1', (row) => {
              row.status = 'done';
            });
            const row = page.tasks.get('t1');
            const atOnce = { status: row?.status, synced: row?.$synced };
            // The server cannot be reached, so the write fails.
            const refused = yield* Effect.tryPromise({
              try: () => edit.isPersisted.promise,
              catch: (error) => error,
            }).pipe(Effect.flip);
            const rolledBack = yield* until(() =>
              page.shows().includes('t1:open'),
            );
            const onServer = (yield* task.get({
              taskId: 't1',
              boardId: 'work',
            }))?.value.status;
            yield* Story.assert(
              'the screen showed the edit at once, not yet confirmed',
              atOnce.status === 'done' && atOnce.synced === false,
            );
            yield* Story.assert(
              'the write failed and the edit came off the screen',
              refused !== undefined && rolledBack && onServer === 'open',
            );
            const shown = page.shows();
            yield* page.close;
            network.online = true;
            return { atOnce, refused: String(refused), shown, onServer };
          }),
        ),
      ),
    }),
  ],
});
