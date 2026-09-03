import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { Story } from 'laymos/story';
import type { StdTableService } from 'std-toolkit/db';
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

// The task this chapter creates, changes and removes from the browser.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// A fresh app for each question, as chapter 25 built it, on the ready-made platform from `env.ts`.
const openApp = Effect.map(browserRuntime, (runtime) =>
  createStdSync({
    name: 'board-edited',
    platform: platform(),
    runtime,
    options: { gcTime: 1 },
  }),
);

// How the collection reads the server: one board at a time, asking for anything new every 20 milliseconds, exactly as in chapter 25.
const readingBoards = {
  partitions: {
    boardId: (boardId: string) => ({
      strategy: syncStrategy.oldToNew<
        typeof Task.Type,
        StdTableService<'board'>
      >({
        source: ({ poll }) =>
          poll({
            fetch: ({ cursor }) => changesOn(boardId, cursor),
            schedule: Schedule.spaced('20 millis'),
          }),
      }),
    }),
  },
};

export const editingTasksFromTheBrowser = Story.make({
  title: 'Editing tasks from the browser',
  description:
    'Writes that start on the screen: what shows at once, what the server is asked to do, and what is left behind when a task is removed.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can the browser create the task instead?', {
      answer:
        'Yes: give the collection an `onInsert` handler that saves the task on the server with the call from chapter 4 and returns what the server stored. The screen shows the new task at once, marked as not yet confirmed (`$synced: false`); when the handler returns, the write is complete and the browser copy holds the task exactly as the server stored it.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            const app = yield* openApp;
            // The collection, now able to write: each handler forwards one change to the server and returns what the server stored.
            const tasks = app.collection({
              schema: Task,
              sync: readingBoards,
              onInsert: (items) =>
                Effect.forEach(items, (item) => task.insert(item)),
              onUpdate: ({ current, updates }) =>
                task.getAndUpdate(
                  { taskId: current.taskId, boardId: current.boardId },
                  updates,
                ),
              onDelete: ({ current }) =>
                task.delete({
                  taskId: current.taskId,
                  boardId: current.boardId,
                }),
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
            // Create the task from the browser.
            const write = tasks.insert(draft);
            // Straight away the screen shows it, not yet confirmed.
            const atOnce = screen.toArray.map(({ title, $synced }) => ({
              title,
              $synced,
            }));
            // Wait for the server to confirm it; the write is then complete.
            yield* Effect.promise(() => write.isPersisted.promise);
            const state = write.state;
            // The server has it.
            const onServer = yield* task.get(key);
            yield* Story.assert(
              'the screen showed the task before the server answered',
              atOnce[0]?.title === 'Write the plan' &&
                atOnce[0].$synced === false,
            );
            yield* Story.assert(
              'the write completed and the server holds the task',
              state === 'completed' &&
                onServer?.value.title === 'Write the plan',
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { atOnce, state, onServer };
          }),
        ),
      ),
    }),
    Story.question(
      'A change in the browser: does it reach the server, and what shows in between?',
      {
        answer:
          'It reaches the server through `onUpdate`, which gets the task as the screen showed it (`current`) and only the fields that changed (`updates`). In between, the screen shows the changed task as not yet confirmed; once the server has stored the change, the write is complete.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              // The server already has the task.
              yield* task.insert(draft);
              const app = yield* openApp;
              const tasks = app.collection({
                schema: Task,
                sync: readingBoards,
                onInsert: (items) =>
                  Effect.forEach(items, (item) => task.insert(item)),
                onUpdate: ({ current, updates }) =>
                  task.getAndUpdate(
                    { taskId: current.taskId, boardId: current.boardId },
                    updates,
                  ),
                onDelete: ({ current }) =>
                  task.delete({
                    taskId: current.taskId,
                    boardId: current.boardId,
                  }),
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
              // Mark the task done from the browser.
              const write = tasks.update('t1', (row) => {
                row.status = 'done';
              });
              // Straight away the screen shows it done, not yet confirmed.
              const atOnce = screen.toArray.map(({ status, $synced }) => ({
                status,
                $synced,
              }));
              // Wait for the server to confirm it; the write is then complete.
              yield* Effect.promise(() => write.isPersisted.promise);
              const state = write.state;
              // The server stored the change, and only the change.
              const onServer = yield* task.get(key);
              yield* Story.assert(
                'the screen showed the change before the server answered',
                atOnce[0]?.status === 'done' && atOnce[0].$synced === false,
              );
              yield* Story.assert(
                'the write completed and the server stored the change',
                state === 'completed' &&
                  onServer?.value.status === 'done' &&
                  onServer.value.title === 'Write the plan',
              );
              yield* Effect.promise(() => screen.cleanup());
              yield* Effect.promise(() => app.dispose());
              return { atOnce, state, onServer };
            }),
          ),
        ),
      },
    ),
    Story.question('Removing from the browser: what remains on the server?', {
      answer:
        'The marked row from chapter 6: `onDelete` calls the same `delete` as before, so the server keeps the task with `_d: true`, and the screen stops showing it. The browser copy keeps the marked row too, which is how it knows the task is gone rather than never loaded.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(draft);
            const app = yield* openApp;
            const tasks = app.collection({
              schema: Task,
              sync: readingBoards,
              onInsert: (items) =>
                Effect.forEach(items, (item) => task.insert(item)),
              onUpdate: ({ current, updates }) =>
                task.getAndUpdate(
                  { taskId: current.taskId, boardId: current.boardId },
                  updates,
                ),
              onDelete: ({ current }) =>
                task.delete({
                  taskId: current.taskId,
                  boardId: current.boardId,
                }),
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
            // Remove the task from the browser.
            const write = tasks.delete('t1');
            // Straight away the screen no longer shows it.
            const atOnce = screen.size;
            // Wait for the server to confirm it.
            yield* Effect.promise(() => write.isPersisted.promise);
            const state = write.state;
            // The server kept a marked row.
            const onServer = yield* task.get(key);
            yield* Story.assert(
              'the screen dropped the task at once and kept it dropped',
              atOnce === 0 && screen.size === 0,
            );
            yield* Story.assert(
              'the write completed and the server holds a marked row',
              state === 'completed' && onServer?.meta._d === true,
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { atOnce, state, onServer };
          }),
        ),
      ),
    }),
  ],
});
