import {
  createLiveQueryCollection,
  createTransaction,
  eq,
} from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { Story } from 'laymos/story';
import type { DecodedEntity, DecodedSingleEntity } from 'std-toolkit/core';
import { createStdSync, syncStrategy } from 'std-toolkit/sync';
import { fresh, platform } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import {
  Board,
  board,
} from '../../02-more-ways-in/11-keeping-boards-and-tasks-in-the-same-table/keeping-boards-and-tasks-in-the-same-table.story.js';
import {
  browserRuntime,
  changesOn,
  until,
} from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';

// Runs a program against a brand-new, empty copy of the table in memory: the server.
const onBoard = fresh('memory', table);

// The task to finish, and the board to rename in the same breath.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;
const workBoard = { boardId: 'work', name: 'Work' };

// A fresh app for each question, with a collection for tasks and one for boards, each read one board at a time, and a screen on each.
const openBoard = Effect.gen(function* () {
  const runtime = yield* browserRuntime;
  const app = createStdSync({
    name: 'board-paired',
    platform: platform(),
    runtime,
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
  const boards = app.collection({
    schema: Board,
    sync: {
      partitions: {
        boardId: (boardId) => ({
          strategy: syncStrategy.oldToNew({
            source: ({ poll }) =>
              poll({
                fetch: ({ cursor }) =>
                  board
                    .get({ boardId })
                    .pipe(
                      Effect.map((row) =>
                        row === null ||
                        (cursor !== null && row.meta._u <= cursor.meta._u)
                          ? []
                          : [row],
                      ),
                    ),
                schedule: Schedule.spaced('20 millis'),
              }),
          }),
        }),
      },
    },
  });
  const taskScreen = createLiveQueryCollection({
    query: (q) =>
      q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
    startSync: true,
    gcTime: 1,
  });
  const boardScreen = createLiveQueryCollection({
    query: (q) =>
      q.from({ board: boards }).where(({ board }) => eq(board.boardId, 'work')),
    startSync: true,
    gcTime: 1,
  });
  yield* Effect.promise(() => taskScreen.preload());
  yield* Effect.promise(() => boardScreen.preload());
  yield* until(() => taskScreen.size === 1 && boardScreen.size === 1);
  const close = Effect.promise(async () => {
    await taskScreen.cleanup();
    await boardScreen.cleanup();
    await app.dispose();
  });
  return { runtime, app, tasks, boards, taskScreen, boardScreen, close };
});

// A batch can return single records too (chapter 12); a collection takes only keyed rows, so keep those.
const isKeyed = <T>(
  row: DecodedEntity<T> | DecodedSingleEntity<T>,
): row is DecodedEntity<T> => '_d' in row.meta;
const keyed = <T>(row: DecodedEntity<T> | DecodedSingleEntity<T>) =>
  isKeyed(row) ? [row] : [];

// What both screens show, side by side.
const showing = (screens: {
  taskScreen: { toArray: readonly { status: string }[] };
  boardScreen: { toArray: readonly { name: string }[] };
}) => ({
  task: screens.taskScreen.toArray.map(({ status }) => status),
  board: screens.boardScreen.toArray.map(({ name }) => name),
});

export const twoChangesAtOnceFromTheBrowser = Story.make({
  title: 'Two changes at once, from the browser',
  description:
    'A task and its board change together from the screen: both show at once, and both land on the server as one batch or not at all.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Do both changes show before the server commits?', {
      answer:
        'Yes. A transaction (one bundle of changes across collections, with one `mutationFn` that sends them) applies both changes to the screens the moment `mutate` runs. The `mutationFn` then hands the server the batch from chapter 13, and both collections take the confirmed rows.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(draft);
            yield* board.insert(workBoard);
            const { runtime, tasks, boards, taskScreen, boardScreen, close } =
              yield* openBoard;
            // The transaction: its `mutationFn` commits both writes as one batch on the server and hands each collection its confirmed row.
            const finishAndRename = createTransaction({
              mutationFn: () =>
                runtime.runPromise(
                  Effect.gen(function* () {
                    const finish = yield* task.getAndUpdateOp(key, {
                      status: 'done',
                    });
                    const rename = yield* board.getAndUpdateOp(
                      { boardId: 'work' },
                      { name: 'Work (done)' },
                    );
                    const [finished, renamed] = yield* table.transact([
                      finish,
                      rename,
                    ]);
                    yield* tasks.utils.applyToSyncReplica(keyed(finished));
                    yield* boards.utils.applyToSyncReplica(keyed(renamed));
                  }),
                ),
            });
            // Both changes, in one go.
            finishAndRename.mutate(() => {
              tasks.update('t1', (row) => {
                row.status = 'done';
              });
              boards.update('work', (row) => {
                row.name = 'Work (done)';
              });
            });
            // Straight away, both screens show the change.
            const atOnce = showing({ taskScreen, boardScreen });
            // Wait for the server to commit the batch.
            yield* Effect.promise(() => finishAndRename.isPersisted.promise);
            const onServer = {
              task: (yield* task.get(key))?.value.status,
              board: (yield* board.get({ boardId: 'work' }))?.value.name,
            };
            yield* Story.assert(
              'both screens changed before the server answered',
              atOnce.task.join() === 'done' &&
                atOnce.board.join() === 'Work (done)',
            );
            yield* Story.assert(
              'the server committed both',
              onServer.task === 'done' && onServer.board === 'Work (done)',
            );
            yield* close;
            return { atOnce, onServer };
          }),
        ),
      ),
    }),
    Story.question('The server refuses: what happens to both?', {
      answer:
        'Both are taken back off the screens. The batch failed as a whole on the server, so the transaction fails as a whole in the browser: the task is open again, the board has its old name, and neither write landed.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(draft);
            yield* board.insert(workBoard);
            const { runtime, tasks, boards, taskScreen, boardScreen, close } =
              yield* openBoard;
            // The same transaction, but its batch also saves a board whose id is taken, so the server refuses the whole batch.
            const finishAndRename = createTransaction({
              mutationFn: () =>
                runtime.runPromise(
                  Effect.gen(function* () {
                    const finish = yield* task.getAndUpdateOp(key, {
                      status: 'done',
                    });
                    const rename = yield* board.getAndUpdateOp(
                      { boardId: 'work' },
                      { name: 'Work (done)' },
                    );
                    const duplicate = yield* board.insertOp(workBoard);
                    const [finished, renamed] = yield* table.transact([
                      finish,
                      rename,
                      duplicate,
                    ]);
                    yield* tasks.utils.applyToSyncReplica(keyed(finished));
                    yield* boards.utils.applyToSyncReplica(keyed(renamed));
                  }),
                ),
            });
            finishAndRename.mutate(() => {
              tasks.update('t1', (row) => {
                row.status = 'done';
              });
              boards.update('work', (row) => {
                row.name = 'Work (done)';
              });
            });
            const atOnce = showing({ taskScreen, boardScreen });
            // Wait for the server's answer; the failure comes back as a value.
            const failure = yield* Effect.tryPromise({
              try: () => finishAndRename.isPersisted.promise,
              catch: (error) => error,
            }).pipe(Effect.flip);
            const afterwards = showing({ taskScreen, boardScreen });
            const onServer = {
              task: (yield* task.get(key))?.value.status,
              board: (yield* board.get({ boardId: 'work' }))?.value.name,
            };
            yield* Story.assert(
              'both changes showed, then both were taken back',
              atOnce.task.join() === 'done' &&
                afterwards.task.join() === 'open' &&
                afterwards.board.join() === 'Work',
            );
            yield* Story.assert(
              'neither write landed on the server',
              onServer.task === 'open' && onServer.board === 'Work',
            );
            yield* close;
            return { atOnce, afterwards, failure: String(failure), onServer };
          }),
        ),
      ),
    }),
  ],
});
