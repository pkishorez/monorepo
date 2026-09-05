import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import {
  createStdSync,
  syncStrategy,
  type StdSyncPlatform,
} from 'std-toolkit/sync';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';
import { platform } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { task } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { until } from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';
import {
  browserRuntime,
  onBoard,
  pushedChanges,
} from '../28-catching-up-on-what-you-missed/catching-up-on-what-you-missed.story.js';

// The task on the server.
const plan = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// Which tabs opened a reader on the server, in order.
const readers: string[] = [];

// One tab on a platform of the question's choosing: a Task collection read through the pushed changes from chapter 28, and a screen on the `work` board.
const openTab = (label: string, tabPlatform: StdSyncPlatform) =>
  Effect.gen(function* () {
    const app = createStdSync({
      name: 'board-one-reader',
      platform: tabPlatform,
      runtime: yield* browserRuntime,
      options: { gcTime: 1 },
    });
    const tasks = app.collection({
      schema: Task,
      sync: {
        partitions: {
          boardId: (boardId) => ({
            strategy: syncStrategy.oldToNew({
              source: ({ live }) =>
                live({
                  open: ({ cursor }) =>
                    Stream.suspend(() => {
                      readers.push(label);
                      return pushedChanges(boardId, cursor);
                    }),
                }),
            }),
          }),
        },
      },
    });
    const screen = createLiveQueryCollection({
      query: (q) =>
        q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
      startSync: true,
      gcTime: 1,
    });
    yield* Effect.promise(() => screen.preload());
    const close = Effect.promise(async () => {
      await screen.cleanup();
      await app.dispose();
    });
    return { label, screen, close };
  });

export const onlyOneTabTalksToTheServer = Story.make({
  title: 'Only one tab talks to the server',
  description:
    'Ten tabs, one connection to the server: how tabs agree on who reads, what happens when that tab goes away, and what a late tab can and cannot expect.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Is leadership automatic, and do ten tabs share one reader?',
      {
        answer:
          'It is not automatic: each tab reads the server on its own until the tabs are given one shared leadership (an agreement on which tab owns a reader, with the others waiting their turn). `platform()` here makes a private one per call; give every tab the same `inMemoryLeadership()` and ten tabs open one reader, and peer sync keeps the other nine current.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              // Two tabs, each with its own private leadership: both read.
              readers.length = 0;
              const alone = [
                yield* openTab('a', platform({ peerSync: true })),
                yield* openTab('b', platform({ peerSync: true })),
              ];
              yield* until(() => readers.length === 2);
              const withoutSharing = [...readers];
              yield* Effect.forEach(alone, (tab) => tab.close);
              // Ten tabs sharing one leadership: one reads.
              readers.length = 0;
              const leadership = inMemoryLeadership();
              const tabs = yield* Effect.forEach(
                Array.from({ length: 10 }, (_, index) => `tab-${index + 1}`),
                (label) =>
                  openTab(label, {
                    ...platform({ peerSync: true }),
                    leadershipLayer: leadership,
                  }),
              );
              yield* until(() => readers.length === 1);
              yield* Effect.sleep('30 millis');
              // The server saves a task; every tab shows it.
              yield* task.insert(plan);
              const allShow = yield* until(() =>
                tabs.every((tab) => tab.screen.size === 1),
              );
              yield* Story.assert(
                'without shared leadership, both tabs read',
                withoutSharing.length === 2,
              );
              const withSharing = [...readers];
              const tabsShowing = tabs.filter(
                (tab) => tab.screen.size === 1,
              ).length;
              yield* Story.assert(
                'with it, one tab read and all ten showed the task',
                withSharing.length === 1 && allShow,
              );
              yield* Effect.forEach(tabs, (tab) => tab.close);
              return { withoutSharing, withSharing, tabsShowing };
            }),
          ),
        ),
      },
    ),
    Story.question('Closing or hiding the leader: who takes over?', {
      answer:
        'The next tab waiting: closing the leader releases its place and another tab opens the reader, carrying on from what its own copy already has. In a real browser the default is `webLockLeadership`, which also hands over when the leading tab is hidden or frozen; chapter 35 shows that on the real platform.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            readers.length = 0;
            const leadership = inMemoryLeadership();
            const first = yield* openTab('first', {
              ...platform({ peerSync: true }),
              leadershipLayer: leadership,
            });
            yield* until(() => readers.length === 1);
            const second = yield* openTab('second', {
              ...platform({ peerSync: true }),
              leadershipLayer: leadership,
            });
            yield* Effect.sleep('30 millis');
            const beforeClosing = [...readers];
            // Close the leader.
            yield* first.close;
            const tookOver = yield* until(() => readers.length === 2);
            // The server saves a task; the new leader's screen shows it.
            yield* task.insert(plan);
            const shown = yield* until(() => second.screen.size === 1);
            yield* Story.assert(
              'the second tab waited while the first led',
              beforeClosing.join() === 'first',
            );
            yield* Story.assert(
              'then took over and kept reading',
              tookOver && readers.join() === 'first,second' && shown,
            );
            yield* second.close;
            return { beforeClosing, afterClosing: readers };
          }),
        ),
      ),
    }),
    Story.question(
      'Can a late tab with its own in-memory copy miss old data?',
      {
        answer:
          'Yes: leadership only stops the late tab from opening a second reader — it does not hand it what the leader already read, and peer sync does not repeat old messages. A shared durable copy fixes that: with `store: "idb"` the leader writes into the same copy and a late tab fills its screen from it before waiting its turn, because leadership is not a cache.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              yield* task.insert(plan);
              // In memory: the leader reads the task, then a late tab opens with an empty copy of its own.
              readers.length = 0;
              const leadership = inMemoryLeadership();
              const leader = yield* openTab('leader', {
                ...platform({ peerSync: true }),
                leadershipLayer: leadership,
              });
              // A witness tab was present the whole time: once its screen fills
              // over peer sync, the leader's message has definitely been sent.
              const witness = yield* openTab('witness', {
                ...platform({ peerSync: true }),
                leadershipLayer: leadership,
              });
              yield* until(() => leader.screen.size === 1);
              yield* until(() => witness.screen.size === 1);
              yield* witness.close;
              // Only now open the late tab: the telling already happened, and
              // peer sync does not repeat it.
              const late = yield* openTab('late', {
                ...platform({ peerSync: true }),
                leadershipLayer: leadership,
              });
              yield* Effect.sleep('50 millis');
              const inMemory = {
                late: late.screen.size,
                readers: [...readers],
              };
              yield* leader.close;
              yield* late.close;
              // Shared durable copy: the same again, but both tabs keep their copy in one IndexedDB database.
              readers.length = 0;
              const shared = inMemoryLeadership();
              const durable = () => ({
                ...platform({
                  peerSync: true,
                  store: 'idb',
                  databaseName: 'one-browser',
                }),
                leadershipLayer: shared,
              });
              const durableLeader = yield* openTab('leader', durable());
              yield* until(() => durableLeader.screen.size === 1);
              const durableLate = yield* openTab('late', durable());
              const filled = yield* until(() => durableLate.screen.size === 1);
              const withStore = {
                late: durableLate.screen.size,
                readers: [...readers],
              };
              yield* Story.assert(
                'the late in-memory tab stayed empty, and no second reader opened',
                inMemory.late === 0 && inMemory.readers.join() === 'leader',
              );
              yield* Story.assert(
                'the late tab on the shared copy showed the task, still with one reader',
                filled && withStore.readers.join() === 'leader',
              );
              yield* durableLeader.close;
              yield* durableLate.close;
              return { inMemory, withStore };
            }),
          ),
        ),
      },
    ),
  ],
});
