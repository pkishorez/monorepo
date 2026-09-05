import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule, Schema } from 'effect';
import { Story } from 'laymos/story';
import { Memory } from 'std-toolkit/db/memory';
import {
  createStdSync,
  OutboxUnreachable,
  syncStore,
  syncStrategy,
} from 'std-toolkit/sync';
import { connectivity, fresh, platform } from '../../env.js';
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

// Every write the server received, as `what:task`, in the order it arrived.
const writes: string[] = [];

// One browser that can lose its network. `connectivity()` from `env.ts` is a switch the proof flips; the outbox keeps every write until the server has confirmed it.
const openOffline = Effect.gen(function* () {
  const network = connectivity();
  const store = Memory.make(syncStore).layer;
  const app = createStdSync({
    name: 'board-offline',
    platform: {
      ...platform(),
      storeLayer: store,
      connectivity: network.connectivity,
    },
    runtime: yield* browserRuntime,
    options: { gcTime: 1 },
    outbox: true,
  });
  // A handler that finds the network gone says so with `OutboxUnreachable`, and its write stays kept rather than failed.
  const reachable = <A, E, R>(
    write: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | OutboxUnreachable, R> =>
    network.connectivity.isOnline()
      ? write
      : Effect.fail(new OutboxUnreachable({ message: 'no network' }));
  const tasks = app.collection({
    schema: Task,
    sync: {
      partitions: {
        boardId: (boardId) => ({
          strategy: syncStrategy.oldToNew({
            source: ({ paginated }) =>
              paginated({ fetch: ({ cursor }) => changesOn(boardId, cursor) }),
          }),
        }),
      },
    },
    onInsert: (items) =>
      Effect.forEach(items, (item) =>
        reachable(task.insert(item)).pipe(
          Effect.tap(() =>
            Effect.sync(() => writes.push(`insert:${item.taskId}`)),
          ),
        ),
      ),
    onUpdate: ({ current, updates }) =>
      reachable(
        task.getAndUpdate(
          { taskId: current.taskId, boardId: current.boardId },
          updates,
        ),
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => writes.push(`update:${current.taskId}`)),
        ),
      ),
  });
  const screen = createLiveQueryCollection({
    query: (q) =>
      q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
    startSync: true,
    gcTime: 1,
  });
  yield* Effect.promise(() => screen.preload());
  yield* until(() => screen.size === 2);
  // What the outbox holds right now: one line per kept write.
  const kept = app.outbox.entity
    .query('primary', { pk: { sync: 'board-offline' }, '>=': null })
    .pipe(
      Effect.provide(store),
      Effect.map((page) =>
        page.items.map(({ value }) => ({
          id: value.key,
          name: value.name,
          status: value.status,
        })),
      ),
    );
  // Waits until the outbox is empty.
  const drained = kept.pipe(
    Effect.repeat({
      schedule: Schedule.spaced('5 millis'),
      until: (entries) => entries.length === 0,
      times: 400,
    }),
  );
  const shows = () =>
    screen.toArray.map(({ taskId, title, status, colour, $synced }) => ({
      taskId,
      title,
      status,
      colour,
      $synced,
    }));
  const close = Effect.promise(async () => {
    await screen.cleanup();
    await app.dispose();
  });
  return { app, network, tasks, screen, shows, kept, drained, close };
});

export const theNetworkGoesAway = Story.make({
  title: 'The network goes away',
  description:
    'Edits made with no network: what the screen shows, where the writes wait, what happens to them when the network is back, and what happens when the server turns one down.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Editing while offline: what shows, and where is the write kept?',
      {
        answer:
          "The screen shows the edit at once, as not yet confirmed, and stays that way. With `outbox: true` every write is first kept in the outbox (a list of unconfirmed writes in the browser's own store, one entry per write) and only then sent; with no network, sending waits, and the entry is still there after a reload if the store is durable.",
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              yield* task.insert(review);
              writes.length = 0;
              const { network, tasks, shows, kept, close } = yield* openOffline;
              // The network goes away.
              yield* network.offline;
              // Mark a task done. Nothing waits on the write: offline, it would wait for hours.
              tasks.update('t1', (row) => {
                row.status = 'done';
              });
              const atOnce = shows();
              yield* Effect.sleep('50 millis');
              // The write is kept in the outbox, and the server has not seen it.
              const inOutbox = yield* kept;
              const onServer = (yield* task.get({
                taskId: 't1',
                boardId: 'work',
              }))?.value.status;
              yield* Story.assert(
                'the screen shows the edit, not yet confirmed',
                atOnce.find(({ taskId }) => taskId === 't1')?.status ===
                  'done' &&
                  atOnce.find(({ taskId }) => taskId === 't1')?.$synced ===
                    false,
              );
              yield* Story.assert(
                'one pending entry is kept, and the server was not written to',
                inOutbox.length === 1 &&
                  inOutbox[0]?.status === 'pending' &&
                  writes.length === 0 &&
                  onServer === 'open',
              );
              yield* close;
              return { atOnce, inOutbox, onServer };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Reconnecting: what happens to the kept writes, and in what order?',
      {
        answer:
          'They are sent, each task in the order its edits were made and different tasks side by side; several edits to one task fold into one write. Something that is not one task, like greying out a whole board, is an offline action: a named, checked payload with an `onMutate` for the screen and a `mutationFn` for the server, kept and replayed the same way.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              yield* task.insert(review);
              writes.length = 0;
              const { app, network, tasks, shows, kept, drained, close } =
                yield* openOffline;
              // An offline action: grey out every task on a board.
              const greyOut = app.createOfflineAction({
                name: 'grey-out-board',
                payload: Schema.Struct({ boardId: Schema.String }),
                onMutate: ({ boardId }) => {
                  for (const row of tasks.toArray)
                    if (row.boardId === boardId)
                      tasks.update(row.taskId, (draft) => {
                        draft.colour = 'grey';
                      });
                },
                mutationFn: ({ boardId }) =>
                  Effect.forEach(['t1', 't2'], (taskId) =>
                    task.getAndUpdate({ taskId, boardId }, { colour: 'grey' }),
                  ).pipe(
                    Effect.tap(() =>
                      Effect.sync(() => writes.push(`grey-out:${boardId}`)),
                    ),
                  ),
              });
              yield* network.offline;
              // Offline: two edits to one task, one to another, and the action.
              tasks.update('t1', (row) => {
                row.title = 'Write the plan today';
              });
              tasks.update('t1', (row) => {
                row.status = 'done';
              });
              tasks.update('t2', (row) => {
                row.status = 'done';
              });
              greyOut({ boardId: 'work' });
              yield* Effect.sleep('50 millis');
              const keptOffline = yield* kept;
              // The network is back.
              yield* network.online;
              yield* drained;
              const onServer = yield* Effect.forEach(['t1', 't2'], (taskId) =>
                task
                  .get({ taskId, boardId: 'work' })
                  .pipe(Effect.map((row) => row?.value)),
              );
              yield* Story.assert(
                'four entries were kept: three edits and one action',
                keptOffline.length === 4 &&
                  keptOffline.filter(
                    ({ name }) => name === 'action:grey-out-board',
                  ).length === 1,
              );
              yield* Story.assert(
                'the two edits to t1 folded into one write, and everything reached the server',
                writes.filter((write) => write === 'update:t1').length === 1 &&
                  writes.length === 3 &&
                  onServer[0]?.title === 'Write the plan today' &&
                  onServer[0].status === 'done' &&
                  onServer.every((row) => row?.colour === 'grey'),
              );
              const shown = shows();
              yield* close;
              return { keptOffline, writes: [...writes], onServer, shown };
            }),
          ),
        ),
      },
    ),
    Story.question('The server refuses a replayed write. What happens?', {
      answer:
        "That entry is marked `failed`, its edit rolls back off the screen — here the server's own `t3` syncs down in its place — and the other entries carry on; nothing is retried on its own. A failed entry stays in the outbox for the app to look at until it is discarded with `outbox.discard`.",
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            yield* task.insert(review);
            writes.length = 0;
            const { app, network, tasks, screen, kept, close } =
              yield* openOffline;
            // Meanwhile someone else saved `t3` on the server; this browser has not seen it.
            yield* task.insert({ ...plan, taskId: 't3', title: 'Send it' });
            yield* network.offline;
            // Offline: create a `t3` of our own, and finish `t1`.
            const create = tasks.insert({
              ...plan,
              taskId: 't3',
              title: 'Ship it',
            });
            tasks.update('t1', (row) => {
              row.status = 'done';
            });
            const atOnce = screen.size;
            // The network is back; the server refuses the second `t3`.
            yield* network.online;
            const refused = yield* Effect.tryPromise({
              try: () => create.isPersisted.promise,
              catch: (error) => error,
            }).pipe(Effect.flip);
            // Waits until the delivered edit is gone from the outbox and only the failed entry is left.
            const afterwards = yield* kept.pipe(
              Effect.repeat({
                schedule: Schedule.spaced('5 millis'),
                until: (entries) =>
                  entries.length === 1 && entries[0]?.status === 'failed',
                times: 400,
              }),
            );
            const failed = afterwards.find(({ status }) => status === 'failed');
            // Take the failed entry out of the outbox.
            if (failed)
              yield* Effect.promise(() => app.outbox.discard(failed.id));
            const discarded = yield* kept;
            // Our refused `t3` rolls back, and the server's own `t3` syncs down in its place.
            const settled = yield* until(() =>
              screen.toArray.some(
                ({ taskId, title }) => taskId === 't3' && title === 'Send it',
              ),
            );
            yield* Story.assert(
              "the refused create came off the screen, the server's t3 took its place, and the other edit went through",
              atOnce === 3 &&
                settled &&
                screen.size === 3 &&
                writes.join() === 'update:t1',
            );
            yield* Story.assert(
              'the entry was kept as failed until it was discarded',
              failed?.name === 'collection:board-offline.task' &&
                discarded.length === 0,
            );
            yield* close;
            return {
              atOnce,
              refused: String(refused),
              afterwards,
              discarded,
              writes: [...writes],
              size: screen.size,
            };
          }),
        ),
      ),
    }),
  ],
});
