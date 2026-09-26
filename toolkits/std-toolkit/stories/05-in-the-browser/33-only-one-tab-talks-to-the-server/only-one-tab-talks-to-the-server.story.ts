import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import {
  createStdSync,
  strategy,
  type StdSyncPlatform,
} from 'std-toolkit/sync';
import { browserTabs, platform } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { task } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { until } from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';
import {
  browserRuntime,
  onBoard,
  pushedChanges,
} from '../28-catching-up-on-what-you-missed/catching-up-on-what-you-missed.story.js';

// A task on the server, on the `work` board.
const plan = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// Every reader a tab opened on the server, in order, as `tab:board:after`, where `after` is the newest task it already had (`start` for none).
const readers: string[] = [];

// One tab on a platform of the question's choosing: a Task collection read through the pushed changes from chapter 28, and a screen on each board it is given (`work` unless said otherwise).
const openTab = (
  label: string,
  tabPlatform: StdSyncPlatform,
  boards: readonly string[] = ['work'],
) =>
  Effect.gen(function* () {
    const app = createStdSync({
      name: 'board-one-reader',
      platform: tabPlatform,
      runtime: yield* browserRuntime,
      options: { gcTime: 1 },
    });
    const tasks = app.collection(Task, {
      sync: {
        partitions: {
          boardId: (boardId) =>
            strategy.oldToNew({
              subscribe: ({ after }) =>
                Stream.suspend(() => {
                  readers.push(
                    `${label}:${boardId}:${after?.value.taskId ?? 'start'}`,
                  );
                  return pushedChanges(boardId, after);
                }),
            }),
        },
      },
    });
    const screens = boards.map((boardId) =>
      createLiveQueryCollection({
        query: (q) =>
          q
            .from({ task: tasks })
            .where(({ task }) => eq(task.boardId, boardId)),
        startSync: true,
        // Nothing subscribes to this screen the way a page would, so keep it
        // until the chapter cleans it up.
        gcTime: 60_000,
      }),
    );
    yield* Effect.forEach(screens, (screen) =>
      Effect.promise(() => screen.preload()),
    );
    const screen = screens[0]!;
    // How many tasks the tab shows across all its screens.
    const size = () => screens.reduce((total, one) => total + one.size, 0);
    const close = Effect.promise(async () => {
      await Promise.all(screens.map((one) => one.cleanup()));
      await app.dispose();
    });
    return { label, screen, size, close };
  });

export const onlyOneTabTalksToTheServer = Story.make({
  title: 'Only one tab talks to the server',
  description:
    'Ten tabs, one connection to the server: how tabs agree on who reads, what happens when that tab goes away, and how the reading of different boards is shared out.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Is leadership automatic, and do ten tabs share one reader?',
      {
        answer:
          'It is not automatic: tabs that share nothing each read the server on their own. Tabs of one browser share leadership (a lock per reading job: the tab holding it reads, the others wait their turn), so ten tabs open one reader. That tab saves what it reads in the shared store and rings the doorbell, and the other nine show it from there. `browserTabs()` gives every tab the same store, lock and doorbell; `platform()` gives a tab its own.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              // Two tabs that share nothing: both read.
              readers.length = 0;
              const alone = [
                yield* openTab('a', platform()),
                yield* openTab('b', platform()),
              ];
              yield* until(() => readers.length === 2);
              const withoutSharing = [...readers];
              yield* Effect.forEach(alone, (tab) => tab.close);
              // Ten tabs of one browser: one reads.
              readers.length = 0;
              const browser = browserTabs();
              const tabs = yield* Effect.forEach(
                Array.from({ length: 10 }, (_, index) => `tab-${index + 1}`),
                (label) => openTab(label, browser.tab()),
              );
              yield* until(() => readers.length === 1);
              yield* Effect.sleep('30 millis');
              // The server saves a task; every tab shows it.
              yield* task.insert(plan);
              const allShow = yield* until(() =>
                tabs.every((tab) => tab.screen.size === 1),
              );
              yield* Story.assert(
                'tabs that share nothing both read',
                withoutSharing.length === 2,
              );
              const withSharing = [...readers];
              const tabsShowing = tabs.filter(
                (tab) => tab.screen.size === 1,
              ).length;
              yield* Story.assert(
                'tabs of one browser opened one reader, and all ten showed the task',
                withSharing.length === 1 && allShow,
              );
              yield* Effect.forEach(tabs, (tab) => tab.close);
              return { withoutSharing, withSharing, tabsShowing };
            }),
          ),
        ),
      },
    ),
    Story.question('Closing the leader: who takes over?', {
      answer:
        'The next tab waiting. Closing the leader releases its lock, and a waiting tab opens the reader. It does not start over: the leader saved how far it had read in the shared store, so the new leader asks only for what came after. A real browser does the same with Web Locks, which the browser releases when a tab closes or crashes; chapter 35 shows that on the real platform.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            yield* task.insert(plan);
            readers.length = 0;
            const browser = browserTabs();
            const first = yield* openTab('first', browser.tab());
            yield* until(() => first.screen.size === 1);
            const second = yield* openTab('second', browser.tab());
            yield* Effect.sleep('30 millis');
            const beforeClosing = [...readers];
            // Close the leader.
            yield* first.close;
            const tookOver = yield* until(() => readers.length === 2);
            // The server saves a task; the new leader's screen shows it.
            yield* task.insert({ ...plan, taskId: 't2', title: 'Review it' });
            const shown = yield* until(() => second.screen.size === 2);
            yield* Story.assert(
              'the second tab waited while the first led',
              beforeClosing.join() === 'first:work:start',
            );
            yield* Story.assert(
              'then took over from where the first had got to, and kept reading',
              tookOver && readers[1] === 'second:work:t1' && shown,
            );
            yield* second.close;
            return { beforeClosing, afterClosing: [...readers] };
          }),
        ),
      ),
    }),
    Story.question(
      'Two tabs look at different boards. Does one tab read them all?',
      {
        answer:
          'No: every reading job has its own lock, so each board is led by whichever tab opened it first. Here the first tab leads `work`, and the second tab, which also shows `home`, leads that. One lock for the whole app would leave `home` with no reader, since only the second tab wants it. Either way every tab shows what any leader read, because they all read from the one store.',
        proof: onBoard(
          Story.flow(
            Effect.gen(function* () {
              readers.length = 0;
              const browser = browserTabs();
              // The first tab shows `work`; the second shows `work` and `home`.
              const first = yield* openTab('first', browser.tab(), ['work']);
              yield* until(() => readers.length === 1);
              const second = yield* openTab('second', browser.tab(), [
                'work',
                'home',
              ]);
              yield* until(() => readers.length === 2);
              yield* Effect.sleep('30 millis');
              const opened = [...readers].sort();
              // The server saves one task on each board.
              yield* task.insert(plan);
              yield* task.insert({
                ...plan,
                taskId: 't2',
                boardId: 'home',
                title: 'Buy milk',
              });
              const allShow = yield* until(
                () => first.size() === 1 && second.size() === 2,
              );
              const shows = { first: first.size(), second: second.size() };
              yield* Story.assert(
                'the first tab reads work, and the second reads home',
                opened.join() === 'first:work:start,second:home:start',
              );
              yield* Story.assert(
                'and each tab shows every board it looks at',
                allShow,
              );
              yield* first.close;
              yield* second.close;
              return { opened, shows };
            }),
          ),
        ),
      },
    ),
  ],
});
