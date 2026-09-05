import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { Story } from 'laymos/story';
import { createStdSync, paceStrategy, syncStrategy } from 'std-toolkit/sync';
import type { PaceStrategyFactory } from 'std-toolkit/sync/paced';
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

// The task whose title is being typed.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: '',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// Ten keystrokes: the title as it looks after each one.
const keystrokes = Array.from({ length: 10 }, (_, index) =>
  'Write plan'.slice(0, index + 1),
);

// Every write the server received from the browser: the task as the browser saw it, and the fields that changed.
const writes: {
  current: typeof Task.Type;
  updates: Partial<typeof Task.Type>;
}[] = [];

// A fresh app for each question.
const openApp = Effect.map(browserRuntime, (runtime) =>
  createStdSync({
    name: 'board-typed',
    platform: platform(),
    runtime,
    options: { gcTime: 1 },
  }),
);

// The collection from chapter 26, with the update handler noting every write and a pace chosen per question.
const openTasks = (pacing: PaceStrategyFactory) =>
  Effect.map(openApp, (app) => {
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
      onUpdate: ({ current, updates }) =>
        Effect.suspend(() => {
          writes.push({ current, updates });
          return task.getAndUpdate(
            { taskId: current.taskId, boardId: current.boardId },
            updates,
          );
        }),
      pacing,
    });
    const screen = createLiveQueryCollection({
      query: (q) =>
        q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
      startSync: true,
      gcTime: 1,
    });
    return { app, tasks, screen };
  });

// Types the ten keystrokes as paced updates, waits for the server to hold the final title, and reports how many writes it took.
const typeTheTitle = (pacing: PaceStrategyFactory) =>
  Effect.gen(function* () {
    writes.length = 0;
    const { app, tasks, screen } = yield* openTasks(pacing);
    yield* Effect.promise(() => screen.preload());
    yield* until(() => screen.size === 1);
    for (const title of keystrokes) tasks.utils.pacedUpdate('t1', { title });
    yield* until(() => writes.at(-1)?.updates.title === 'Write plan');
    yield* Effect.sleep('30 millis');
    const onServer = yield* task.get(key);
    yield* Effect.promise(() => screen.cleanup());
    yield* Effect.promise(() => app.dispose());
    return { writes: writes.length, onServer: onServer?.value.title };
  });

export const typingFastWithoutFloodingTheServer = Story.make({
  title: 'Typing fast without flooding the server',
  description:
    'A title typed one letter at a time: how many writes reach the server, what each write is based on, and which pace suits which situation.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Ten keystrokes: how many writes reach the server?', {
      answer:
        'One, with a debounce pace: `utils.pacedUpdate` shows every keystroke on the screen at once but hands the server only what the pace lets through, and `paceStrategy.debounce` waits for a pause in typing (30 milliseconds here) before sending the latest title. Every keystroke is a paced update; the collection decides when to write.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(draft);
            writes.length = 0;
            // The collection, paced to wait for a pause in typing.
            const { app, tasks, screen } = yield* openTasks(
              paceStrategy.debounce({ wait: 30 }),
            );
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            // Ten keystrokes, as fast as they come.
            for (const title of keystrokes)
              tasks.utils.pacedUpdate('t1', { title });
            // The screen already shows the whole title.
            const shownAtOnce = screen.toArray[0]?.title;
            // Wait for the server to receive the final title.
            yield* until(() => writes.at(-1)?.updates.title === 'Write plan');
            yield* Effect.sleep('30 millis');
            const onServer = yield* task.get(key);
            yield* Story.assert(
              'the screen kept up with every keystroke',
              shownAtOnce === 'Write plan',
            );
            yield* Story.assert(
              'the server got one write, with the final title',
              writes.length === 1 && onServer?.value.title === 'Write plan',
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return {
              shownAtOnce,
              writes: writes.map(({ updates }) => updates),
              onServer,
            };
          }),
        ),
      ),
    }),
    Story.question(
      'What does a paced update use as its current value, and what after the server changed the row?',
      {
        answer:
          'The task as the screen shows it, each time. The first write is based on the row as it stood; when the server changes the same task in between and the change reaches the screen, the next paced update is based on that fresh row, not on a copy kept from the first one.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert({ ...draft, title: 'Write the plan' });
              writes.length = 0;
              // The default pace, `coalesce`: send at once, and merge whatever arrives while a write is out into one more write.
              const { app, tasks, screen } = yield* openTasks(
                paceStrategy.coalesce(),
              );
              yield* Effect.promise(() => screen.preload());
              yield* until(() => screen.size === 1);
              // Mark the task done from the browser.
              tasks.utils.pacedUpdate('t1', { status: 'done' });
              yield* until(() => writes.length === 1);
              // Someone else renames it on the server; the change reaches the screen.
              yield* task.getAndUpdate(key, { title: 'Write the plan today' });
              yield* until(
                () => screen.toArray[0]?.title === 'Write the plan today',
              );
              // Mark it open again from the browser.
              tasks.utils.pacedUpdate('t1', { status: 'open' });
              yield* until(() => writes.length === 2);
              const basedOn = writes.map(({ current }) => current.title);
              yield* Story.assert(
                'the first write was based on the row as it stood',
                basedOn[0] === 'Write the plan',
              );
              yield* Story.assert(
                'the second on the renamed row the screen was showing',
                basedOn[1] === 'Write the plan today',
              );
              yield* Effect.sleep('30 millis');
              yield* Effect.promise(() => screen.cleanup());
              yield* Effect.promise(() => app.dispose());
              return { basedOn, writes };
            }),
          ),
        ),
      },
    ),
    Story.question('Which pace fits which situation?', {
      answer:
        '`debounce` for typing, where only the end result matters and a pause will come. `throttle` for a slider or a drag, where the server should see progress but not every pixel. `coalesce` (the default) for clicks, where the first change should go straight away and anything that piles up behind it goes as one more write.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(draft);
            // The same ten keystrokes under each pace.
            const debounce = yield* typeTheTitle(
              paceStrategy.debounce({ wait: 30 }),
            );
            const throttle = yield* typeTheTitle(
              paceStrategy.throttle({ wait: 30 }),
            );
            const coalesce = yield* typeTheTitle(paceStrategy.coalesce());
            yield* Story.assert(
              'every pace ended with the final title on the server',
              [debounce, throttle, coalesce].every(
                ({ onServer }) => onServer === 'Write plan',
              ),
            );
            yield* Story.assert(
              'debounce wrote once; throttle and coalesce wrote a little more, never ten times',
              debounce.writes === 1 &&
                throttle.writes < 10 &&
                coalesce.writes < 10,
            );
            return { debounce, throttle, coalesce };
          }),
        ),
      ),
    }),
  ],
});
