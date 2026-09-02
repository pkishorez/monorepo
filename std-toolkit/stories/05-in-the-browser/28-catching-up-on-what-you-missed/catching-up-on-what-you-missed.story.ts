import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import {
  defaultBroadcaster,
  type Broadcaster,
  type DecodedEntity,
} from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { createStdSync, syncStrategy } from 'std-toolkit/sync';
import { fresh, platform } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import {
  changesOn,
  until,
} from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';

// Runs a program against a brand-new, empty copy of the table in memory, with the change relay from chapter 16 in place so the server can push.
export const onBoard = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  fresh('memory', table)(program.pipe(Effect.provide(defaultBroadcaster)));

// The browser runs where the proof runs, as in chapter 25; this time it also borrows the change relay.
export const browserRuntime = Effect.map(
  Effect.context<StdTableService<'board'> | Broadcaster>(),
  (services) => ({
    runSync: Effect.runSyncWith(services),
    runPromise: Effect.runPromiseWith(services),
    contextEffect: Effect.succeed(services),
  }),
);

// A fresh app for each question.
const openApp = Effect.map(browserRuntime, (runtime) =>
  createStdSync({
    name: 'board-caught-up',
    platform: platform(),
    runtime,
    options: { gcTime: 1 },
  }),
);

// Five tasks the server saved while the browser was away.
const history = [
  'Write the plan',
  'Review it',
  'Send it',
  'File it',
  'Archive it',
].map((title, index) => ({
  taskId: `t${index + 1}`,
  boardId: 'work',
  title,
  status: 'open' as const,
  assignee: null,
  colour: 'blue',
  notes: '',
}));
const seed = Effect.forEach(history, (draft) => task.insert(draft));

type Change = DecodedEntity<typeof Task.Type>;

// Three ways to read the server. `newerChanges`: the next `limit` changes after `cursor`, oldest first. `olderChanges`: the `limit` changes just before `cursor` (`null` means the newest there are). `pushedChanges`: the change notices from chapter 16, after a catch-up read.
const newerChanges = (boardId: string, cursor: Change | null, limit: number) =>
  changesOn(boardId, cursor).pipe(Effect.map((items) => items.slice(0, limit)));
const olderChanges = (boardId: string, cursor: Change | null, limit: number) =>
  task.query('primary', { pk: { boardId }, '>=': null }).pipe(
    Effect.map((page) =>
      page.items
        .filter((item) => cursor === null || item.meta._u < cursor.meta._u)
        .sort((left, right) => (left.meta._u < right.meta._u ? -1 : 1))
        .slice(-limit),
    ),
  );
export const pushedChanges = (boardId: string, cursor: Change | null) =>
  Stream.merge(
    task.subscribe({ boardId }).pipe(Stream.map((change) => [change])),
    Stream.fromEffect(changesOn(boardId, cursor)),
  );

// Every page the server handed out, as update stamps, so a proof can see the order pages came in.
const pages: string[][] = [];
const noting = <E, R>(page: Effect.Effect<readonly Change[], E, R>) =>
  page.pipe(
    Effect.tap((items) =>
      Effect.sync(() => {
        if (items.length > 0) pages.push(items.map(({ meta }) => meta._u));
      }),
    ),
  );

export const catchingUpOnWhatYouMissed = Story.make({
  title: 'Catching up on what you missed',
  description:
    'A browser that has been away: how it reads the history it missed, in which order, and how a change that happens after it caught up still arrives.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The server has history before the browser mounts. Is it read, and do old deletes stay deleted?',
      {
        answer:
          'Yes: `syncStrategy.oldToNew` reads forward from the start, one page at a time, until the server has nothing newer, and remembers where it got to. A task deleted long ago comes through as a marked row, so the browser copy knows it is gone and the screen never shows it.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              // History: five tasks, one changed, one deleted.
              yield* seed;
              yield* task.getAndUpdate(
                { taskId: 't1', boardId: 'work' },
                { status: 'done' },
              );
              yield* task.delete({ taskId: 't2', boardId: 'work' });
              pages.length = 0;
              const app = yield* openApp;
              // Read forward from the start, two changes per page.
              const tasks = app.collection({
                schema: Task,
                sync: {
                  partitions: {
                    boardId: (boardId) => ({
                      strategy: syncStrategy.oldToNew({
                        source: ({ paginated }) =>
                          paginated({
                            fetch: ({ cursor }) =>
                              noting(newerChanges(boardId, cursor, 2)),
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
              yield* until(() => screen.size === 4);
              const shown = screen.toArray.map(
                ({ taskId, status }) => `${taskId}:${status}`,
              );
              const stamps = pages.flat();
              yield* Story.assert(
                'the history came in more than one page, oldest first',
                pages.length > 1 &&
                  stamps.every(
                    (stamp, index) => index === 0 || stamps[index - 1]! < stamp,
                  ),
              );
              yield* Story.assert(
                'the screen shows the four live tasks, with the change, and not the deleted one',
                shown.join() === 't1:done,t3:open,t4:open,t5:open',
              );
              yield* Effect.promise(() => screen.cleanup());
              yield* Effect.promise(() => app.dispose());
              return { pages, shown };
            }),
          ),
        ),
      },
    ),
    Story.question('A large backlog: how is it read in pages?', {
      answer:
        'Newest first, if that is what the screen needs: `syncStrategy.newToOld` takes a `backfill` that pages backwards from the newest change, so the most recent tasks show first and older pages fill in behind them, plus a `tail` that keeps listening for anything new once the backlog is done.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* seed;
            pages.length = 0;
            const app = yield* openApp;
            // Page backwards from the newest change, two per page; then listen.
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({
                    strategy: syncStrategy.newToOld({
                      backfill: ({ paginated }) =>
                        paginated({
                          fetch: ({ cursor }) =>
                            noting(olderChanges(boardId, cursor, 2)),
                        }),
                      tail: ({ live }) =>
                        live({
                          open: ({ cursor }) => pushedChanges(boardId, cursor),
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
            yield* until(() => screen.size === 5);
            const shown = screen.toArray.map(({ taskId }) => taskId);
            const newest = pages.flat().sort().slice(-2);
            yield* Story.assert(
              'the first page held the two newest changes, and two more pages followed',
              pages[0]?.join() === newest.join() && pages.length === 3,
            );
            yield* Story.assert(
              'every task made it to the screen',
              shown.length === 5,
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { pages, shown };
          }),
        ),
      ),
    }),
    Story.question('A new edit after the backlog: does it still arrive?', {
      answer:
        'Yes, through the tail, without reading the backlog again. `syncStrategy.bidirectional` fills a backlog from both ends at once (`older` and `newer` pages) and then hands over to the same kind of `tail`; here the tail is the change notices from chapter 16, so an edit arrives the moment the server stores it.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* seed;
            pages.length = 0;
            const app = yield* openApp;
            // Fill the backlog from both ends, then listen.
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({
                    strategy: syncStrategy.bidirectional({
                      older: ({ paginated }) =>
                        paginated({
                          fetch: ({ cursor }) =>
                            noting(olderChanges(boardId, cursor, 2)),
                        }),
                      newer: ({ paginated }) =>
                        paginated({
                          fetch: ({ cursor }) =>
                            noting(newerChanges(boardId, cursor, 2)),
                        }),
                      tail: ({ live }) =>
                        live({
                          open: ({ cursor }) => pushedChanges(boardId, cursor),
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
            yield* until(() => screen.size === 5);
            // The backlog is in; give the tail a moment to open, and note how many pages it took.
            yield* Effect.sleep('30 millis');
            const pagesForBacklog = pages.length;
            // The server changes a task.
            yield* task.getAndUpdate(
              { taskId: 't3', boardId: 'work' },
              { title: 'Send it today' },
            );
            const arrived = yield* until(
              () =>
                screen.toArray.find(({ taskId }) => taskId === 't3')?.title ===
                'Send it today',
            );
            yield* Story.assert('the edit reached the screen', arrived);
            yield* Story.assert(
              'no page was read for it',
              pages.length === pagesForBacklog,
            );
            const shown = screen.toArray.map(
              ({ taskId, title }) => `${taskId}:${title}`,
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { pagesForBacklog, shown };
          }),
        ),
      ),
    }),
  ],
});
