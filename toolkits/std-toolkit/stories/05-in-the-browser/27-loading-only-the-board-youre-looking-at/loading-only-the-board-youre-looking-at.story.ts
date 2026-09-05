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

// One task on each of two boards.
const work = {
  taskId: 'w1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;
const home = { ...work, taskId: 'h1', boardId: 'home', title: 'Buy milk' };

// A fresh app for each question.
const openApp = Effect.map(browserRuntime, (runtime) =>
  createStdSync({
    name: 'board-mounted',
    platform: platform(),
    runtime,
    options: { gcTime: 1 },
  }),
);

// Every board the browser asked the server about, one entry per request, so a proof can see which boards were read and when.
const asked: string[] = [];
const readingBoard = (boardId: string) =>
  syncStrategy.oldToNew<typeof Task.Type, StdTableService<'board'>>({
    source: ({ poll }) =>
      poll({
        fetch: ({ cursor }) =>
          Effect.suspend(() => {
            asked.push(boardId);
            return changesOn(boardId, cursor);
          }),
        schedule: Schedule.spaced('20 millis'),
      }),
  });

export const loadingOnlyTheBoardYoureLookingAt = Story.make({
  title: "Loading only the board you're looking at",
  description:
    'A collection that reads one board at a time: which boards are read, when the reading stops, and what happens with two boards on screen.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Mounting the `work` board: does it load `home` too?', {
      answer:
        "No. `sync.partitions` names a field, `boardId`, and gives one reading recipe per value of it; a screen that asks for `boardId = 'work'` starts the recipe for `work` and nothing else. A partition is one such slice of the collection with its own reading, started and stopped by the screens that ask for it.",
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            // The server has a task on each board.
            yield* task.insert(work);
            yield* task.insert(home);
            asked.length = 0;
            const app = yield* openApp;
            // The collection: one reading recipe per board.
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({ strategy: readingBoard(boardId) }),
                },
              },
            });
            // A screen for the `work` board only.
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
            const shown = screen.toArray.map(({ taskId }) => taskId);
            const boardsRead = [...new Set(asked)];
            yield* Story.assert(
              'the screen shows the work task',
              shown.join() === 'w1',
            );
            yield* Story.assert(
              'only the work board was read from the server',
              boardsRead.join() === 'work',
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { shown, boardsRead };
          }),
        ),
      ),
    }),
    Story.question('And while nothing is mounted?', {
      answer:
        'The reading stops: with no screen asking for `work`, its partition is put away and the server is not asked again. The server keeps taking writes meanwhile, and the next screen to ask for `work` starts the reading again and picks up what was missed.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(work);
            asked.length = 0;
            const app = yield* openApp;
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({ strategy: readingBoard(boardId) }),
                },
              },
            });
            const showWork = () =>
              createLiveQueryCollection({
                query: (q) =>
                  q
                    .from({ task: tasks })
                    .where(({ task }) => eq(task.boardId, 'work')),
                startSync: true,
                gcTime: 1,
              });
            // Mount the work board, see the task, then close the screen.
            const first = showWork();
            yield* Effect.promise(() => first.preload());
            yield* until(() => first.size === 1);
            yield* Effect.promise(() => first.cleanup());
            // With nothing mounted, count the requests over a stretch of time.
            yield* Effect.sleep('50 millis');
            const before = asked.length;
            yield* Effect.sleep('80 millis');
            const whileUnmounted = asked.length - before;
            // Meanwhile the server takes another task.
            yield* task.insert({ ...work, taskId: 'w2', title: 'Review it' });
            // Mount the work board again.
            const second = showWork();
            yield* Effect.promise(() => second.preload());
            yield* until(() => second.size === 2);
            const shown = second.toArray.map(({ taskId }) => taskId);
            yield* Story.assert(
              'the server was not asked while nothing was mounted',
              whileUnmounted === 0,
            );
            yield* Story.assert(
              'the new screen shows both tasks',
              shown.join() === 'w1,w2',
            );
            yield* Effect.promise(() => second.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { whileUnmounted, shown };
          }),
        ),
      ),
    }),
    Story.question('Two boards mounted together?', {
      answer:
        'Two partitions, each read on its own: each screen shows its own board, and the server is asked about both. They share one collection and one browser copy, so a task is never loaded twice.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(work);
            yield* task.insert(home);
            asked.length = 0;
            const app = yield* openApp;
            const tasks = app.collection({
              schema: Task,
              sync: {
                partitions: {
                  boardId: (boardId) => ({ strategy: readingBoard(boardId) }),
                },
              },
            });
            // One screen per board.
            const workScreen = createLiveQueryCollection({
              query: (q) =>
                q
                  .from({ task: tasks })
                  .where(({ task }) => eq(task.boardId, 'work')),
              startSync: true,
              gcTime: 1,
            });
            const homeScreen = createLiveQueryCollection({
              query: (q) =>
                q
                  .from({ task: tasks })
                  .where(({ task }) => eq(task.boardId, 'home')),
              startSync: true,
              gcTime: 1,
            });
            yield* Effect.promise(() => workScreen.preload());
            yield* Effect.promise(() => homeScreen.preload());
            yield* until(() => workScreen.size === 1 && homeScreen.size === 1);
            const shown = {
              work: workScreen.toArray.map(({ taskId }) => taskId),
              home: homeScreen.toArray.map(({ taskId }) => taskId),
            };
            const boardsRead = [...new Set(asked)].sort();
            yield* Story.assert(
              'each screen shows its own board',
              shown.work.join() === 'w1' && shown.home.join() === 'h1',
            );
            yield* Story.assert(
              'both boards were read, and the collection holds both tasks once',
              boardsRead.join() === 'home,work' && tasks.size === 2,
            );
            yield* Effect.promise(() => workScreen.cleanup());
            yield* Effect.promise(() => homeScreen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { shown, boardsRead };
          }),
        ),
      ),
    }),
  ],
});
