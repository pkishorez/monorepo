import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { createStdSync, strategy } from 'std-toolkit/sync';
import {
  buildPacedUpdate,
  paceStrategy,
  type PaceStrategyFactory,
} from 'std-toolkit/sync/paced';
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

// The fields a paced update may change.
type Changes = Partial<Omit<typeof Task.Type, 'taskId' | 'boardId'>>;

// Ten keystrokes: the title as it looks after each one.
const keystrokes = Array.from({ length: 10 }, (_, index) =>
  'Write plan'.slice(0, index + 1),
);

// Every write the server received from the browser: the fields that changed.
const writes: Changes[] = [];

// The collection from chapter 25, reading one board at a time, and a paced update for the task being typed. A paced update has two halves: `optimistic` changes the row on the screen at once, and `commit` sends the changes to the server when the pace lets them through, merged into one.
const openTasks = (pace: PaceStrategyFactory) =>
  Effect.gen(function* () {
    const runtime = yield* browserRuntime;
    const app = createStdSync({
      name: 'board-typed',
      platform: platform(),
      runtime,
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
    // One paced update per task: each gets its own pace, so typing in one task never holds back another.
    const typeInto = buildPacedUpdate<Changes>({
      strategy: pace(),
      optimistic: (changes) =>
        tasks.update(key.taskId, (row) => {
          Object.assign(row, changes);
        }),
      commit: (changes) =>
        runtime.runPromise(
          Effect.suspend(() => {
            writes.push(changes);
            return task.getAndUpdate(key, changes);
          }).pipe(Effect.asVoid),
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
    return { app, typeInto, screen };
  });

// Types the ten keystrokes as paced updates, waits for the server to hold the final title, and reports how many writes it took.
const typeTheTitle = (pace: PaceStrategyFactory) =>
  Effect.gen(function* () {
    writes.length = 0;
    const { app, typeInto, screen } = yield* openTasks(pace);
    yield* Effect.promise(() => screen.preload());
    yield* until(() => screen.size === 1);
    for (const title of keystrokes) typeInto({ title });
    yield* until(() => writes.at(-1)?.title === 'Write plan');
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
        'One, with a debounce pace. `buildPacedUpdate` from `std-toolkit/sync/paced` turns every keystroke into a paced update: its `optimistic` half changes the row on the screen at once, and its `commit` half gets only what the pace lets through, with the keystrokes in between merged into one set of changes. `paceStrategy.debounce` waits for a pause in typing (30 milliseconds here) before it lets the latest title through.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(draft);
            writes.length = 0;
            // The collection, paced to wait for a pause in typing.
            const { app, typeInto, screen } = yield* openTasks(
              paceStrategy.debounce({ wait: 30 }),
            );
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            // Ten keystrokes, as fast as they come.
            for (const title of keystrokes) typeInto({ title });
            // The screen already shows the whole title.
            const shownAtOnce = screen.toArray[0]?.title;
            // Wait for the server to receive the final title.
            yield* until(() => writes.at(-1)?.title === 'Write plan');
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
            return { shownAtOnce, writes: [...writes], onServer };
          }),
        ),
      ),
    }),
    Story.question(
      'What does a paced update send, and what happens when the server changed the row in between?',
      {
        answer:
          'Only the fields it changed, never a whole copy of the row. The server applies them to the row as it stands, so a change someone else made in between is kept. On the screen, each paced update is laid over the row the screen shows at that moment: once the server change has reached the screen, the next paced update starts from the fresh row, not from a copy kept from the first one.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert({ ...draft, title: 'Write the plan' });
              writes.length = 0;
              // The `coalesce` pace: send at once, and merge whatever arrives while a write is out into one more write.
              const { app, typeInto, screen } = yield* openTasks(
                paceStrategy.coalesce(),
              );
              yield* Effect.promise(() => screen.preload());
              yield* until(() => screen.size === 1);
              // Mark the task done from the browser.
              typeInto({ status: 'done' });
              yield* until(() => writes.length === 1);
              // Someone else renames it on the server; the change reaches the screen.
              yield* task.getAndUpdate(key, { title: 'Write the plan today' });
              yield* until(
                () => screen.toArray[0]?.title === 'Write the plan today',
              );
              // Mark it open again from the browser.
              typeInto({ status: 'open' });
              const shownAtOnce = screen.toArray.map(({ title, status }) => ({
                title,
                status,
              }));
              yield* until(() => writes.length === 2);
              yield* Effect.sleep('30 millis');
              const onServer = yield* task.get(key);
              yield* Story.assert(
                'each write carried only the status',
                writes.every(
                  (changes) => Object.keys(changes).join() === 'status',
                ),
              );
              yield* Story.assert(
                'the second paced update was laid over the renamed row',
                shownAtOnce[0]?.title === 'Write the plan today' &&
                  shownAtOnce[0].status === 'open',
              );
              yield* Story.assert(
                'the server kept the rename and the last status',
                onServer?.value.title === 'Write the plan today' &&
                  onServer.value.status === 'open',
              );
              yield* Effect.promise(() => screen.cleanup());
              yield* Effect.promise(() => app.dispose());
              return { writes: [...writes], shownAtOnce, onServer };
            }),
          ),
        ),
      },
    ),
    Story.question('Which pace fits which situation?', {
      answer:
        '`debounce` for typing, where only the end result matters and a pause will come. `throttle` for a slider or a drag, where the server should see progress but not every pixel. `coalesce` for clicks, where the first change should go straight away and anything that piles up behind it goes as one more write.',
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
