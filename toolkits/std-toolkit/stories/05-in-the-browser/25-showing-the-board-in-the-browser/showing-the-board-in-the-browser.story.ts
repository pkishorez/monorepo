import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { Story } from 'laymos/story';
import type { DecodedEntity } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { createStdSync, syncStore, syncStrategy } from 'std-toolkit/sync';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// Runs a program against a brand-new, empty copy of the table in memory. In this act, that copy plays the server.
const onBoard = fresh('memory', table);

// The task the server holds, on the `work` board.
const draft = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// What the browser needs from the place it runs in: somewhere to keep its own copy of the board (memory here), and a way for tabs to agree who talks to the server. Built fresh for every question, like a page load.
const browserPlatform = () => ({
  storeLayer: Memory.make(syncStore).layer,
  leadershipLayer: inMemoryLeadership(),
});

// The browser runs where the proof runs: it borrows the proof's services, so its calls reach the same table and land in the same recording. A real page has no proof and leaves `runtime` out.
export const browserRuntime = Effect.map(
  Effect.context<StdTableService<'board'>>(),
  (services) => ({
    runSync: Effect.runSyncWith(services),
    runPromise: Effect.runPromiseWith(services),
    contextEffect: Effect.succeed(services),
  }),
);

// The server's side of the deal: every task on one board that changed after `cursor` (`null` means from the start), oldest change first. `_u` is the update stamp from chapter 4.
export const changesOn = (
  boardId: string,
  cursor: DecodedEntity<typeof Task.Type> | null,
) =>
  task
    .query('primary', { pk: { boardId }, '>=': null })
    .pipe(
      Effect.map((page) =>
        page.items
          .filter((item) => cursor === null || item.meta._u > cursor.meta._u)
          .sort((left, right) => (left.meta._u < right.meta._u ? -1 : 1)),
      ),
    );

// Sync happens in the background, so a proof waits for it: check every few milliseconds, give up after two seconds.
export const until = (check: () => boolean) =>
  Effect.sync(check).pipe(
    Effect.repeat({
      schedule: Schedule.spaced('5 millis'),
      until: (passed) => passed,
      times: 400,
    }),
  );

export const showingTheBoardInTheBrowser = Story.make({
  title: 'Showing the board in the browser',
  description:
    'The first trip from the table to a screen: what the browser needs before a task can appear, and what it shows when the server adds one.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Before any of this, what is the server here, and does a write to it tell anyone?',
      {
        answer:
          'The server is the table from Act II, running in this same process. A write to it tells nobody: nothing is watching, so anyone who wants to see the board has to come and ask.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save a task on the server.
              const saved = yield* task.insert(draft);
              // Ask the server for the board, the plain way from chapter 7.
              const board = yield* task.query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              yield* Story.assert(
                'the server holds the task',
                board.items.length === 1 &&
                  board.items[0]?.value.taskId === 't1',
              );
              return { saved, onServer: board.items.map(({ value }) => value) };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'What must exist before a task on the server appears in the browser?',
      {
        answer:
          'Three things: a sync app (the piece that keeps a browser copy in step with the server, made once per page with `createStdSync`), a collection for Task (the browser copy of one kind of thing, which is told how to read one board from the server), and a screen watching it (a live query for the board, which is what starts the reading). With all three in place and nothing on the server, the screen shows an empty board.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              // The app: a name every tab of this page shares, the platform, and the runtime it runs in.
              const app = createStdSync({
                name: 'board-shown',
                platform: browserPlatform(),
                runtime: yield* browserRuntime,
                options: { gcTime: 1 },
              });
              // The collection: Task, read one board at a time, by asking the server for anything new every 20 milliseconds.
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
              // The screen: a live query for the `work` board; asking for the board is what starts the reading.
              const screen = createLiveQueryCollection({
                query: (q) =>
                  q
                    .from({ task: tasks })
                    .where(({ task }) => eq(task.boardId, 'work')),
                startSync: true,
                gcTime: 1,
              });
              // Wait until the screen is ready to show something.
              yield* Effect.promise(() => screen.preload());
              const status = screen.status;
              const shown = screen.toArray;
              yield* Story.assert(
                'the screen is ready and the board is empty',
                status === 'ready' && shown.length === 0,
              );
              // Close the screen and the app, as a page does when it unloads.
              yield* Effect.promise(() => screen.cleanup());
              yield* Effect.promise(() => app.dispose());
              return { status, shown };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'The server inserts a task. What does the collection show?',
      {
        answer:
          'The task, a moment later, without the browser doing anything: the collection asks the server for anything new, gets the task back, and the screen updates. The row it shows is the task exactly as the server stored it.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              // The same app, collection and screen as before.
              const app = createStdSync({
                name: 'board-shown',
                platform: browserPlatform(),
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
              // The server saves a task; the browser is not told.
              const saved = yield* task.insert(draft);
              // Wait for the screen to show one task.
              const appeared = yield* until(() => screen.size === 1);
              const shown = screen.toArray;
              yield* Story.assert('the task appeared on the screen', appeared);
              yield* Story.assert(
                'it is the task the server stored',
                shown[0]?.taskId === 't1' &&
                  shown[0].title === 'Write the plan',
              );
              yield* Effect.promise(() => screen.cleanup());
              yield* Effect.promise(() => app.dispose());
              return { saved, shown };
            }),
          ),
        ),
      },
    ),
  ],
});
