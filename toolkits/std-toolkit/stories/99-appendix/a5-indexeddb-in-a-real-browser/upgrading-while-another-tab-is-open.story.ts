import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { IDB } from 'std-toolkit/db/idb';
import { table as plainTable } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task as plainTask } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';
import { table as indexedTable } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// Update stamps for the proofs, counting up from one like every chapter.
let issued = 0;
const stamped = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provideService(Ulid, () => String(++issued).padStart(26, '0')),
  );

// Another tab: a plain connection to the same database, opened outside the adapter.
const openTab = (
  indexedDB: IDBFactory,
  databaseName: string,
  version?: number,
) =>
  Effect.promise(
    () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request =
          version === undefined
            ? indexedDB.open(databaseName)
            : indexedDB.open(databaseName, version);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );

// The task this story saves before any upgrade.
const draft = {
  taskId: 't1',
  boardId: 'work',
  title: 'Survives',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

export const upgradingWhileAnotherTabIsOpen = Story.make({
  title: 'Upgrading while another tab is open',
  description:
    'A version change has to get past every other open connection. Tabs that cooperate let it through; a tab that does not blocks it, and the failure says so.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Can the shape change while another tab has the database open?',
      {
        answer:
          'Yes, if the tabs cooperate: the version change tells every other connection, and a tab that closes its connection when told lets the upgrade through. Only a browser has this problem, because only a browser shares one database between connections it does not control.',
        proof: Story.trace(
          Effect.gen(function* () {
            // A private IndexedDB with the plain table set up in it.
            const indexedDB = new IDBFactory();
            const database = IDB.database({ databaseName: 'board', indexedDB });
            yield* IDB.make(plainTable, { database }).setup;
            // Another tab opens the same database and agrees to make way when asked.
            const otherTab = yield* openTab(indexedDB, 'board');
            let askedToMakeWay = false;
            otherTab.onversionchange = () => {
              askedToMakeWay = true;
              otherTab.close();
            };
            // Upgrade to the indexed table while that tab is open.
            const before = (yield* Effect.promise(database.open)).version;
            yield* IDB.make(indexedTable, { database }).setup;
            const after = (yield* Effect.promise(database.open)).version;
            yield* Story.assert(
              'the other tab was told to make way',
              askedToMakeWay,
            );
            yield* Story.assert(
              'and the upgrade went through',
              after === before + 1,
            );
            return { before, after, askedToMakeWay };
          }),
        ),
      },
    ),
    Story.question('And if the other tab refuses to close?', {
      answer:
        'The upgrade is blocked and `setup` fails with an error that says so, rather than waiting forever. What to do next, retry, ask the user, or give up, is your call.',
      proof: Story.trace(
        Effect.gen(function* () {
          // A private IndexedDB with the plain table set up in it.
          const indexedDB = new IDBFactory();
          const database = IDB.database({ databaseName: 'board', indexedDB });
          yield* IDB.make(plainTable, { database }).setup;
          // Another tab opens the database and ignores the request to make way.
          const stubbornTab = yield* openTab(indexedDB, 'board');
          stubbornTab.onversionchange = () => undefined;
          // Try the upgrade; the failure comes back as a value.
          const failure = yield* IDB.make(indexedTable, {
            database,
          }).setup.pipe(Effect.flip);
          stubbornTab.close();
          yield* Story.assert(
            'the blocked upgrade fails instead of hanging',
            String(failure).includes('blocked'),
          );
          return { failure: String(failure) };
        }),
      ),
    }),
    Story.question(
      'What happens to my tab after another tab upgrades the database?',
      {
        answer:
          'The connection notices the version change, drops its old handle, and the next operation opens a fresh one at the new version. Nothing restarts and no read is lost.',
        proof: Story.trace(
          Effect.gen(function* () {
            // A private IndexedDB with the plain table set up and one task saved.
            const indexedDB = new IDBFactory();
            const database = IDB.database({ databaseName: 'board', indexedDB });
            const plain = IDB.make(plainTable, { database });
            yield* plain.setup;
            yield* stamped(
              plainTask.insert(draft).pipe(Effect.provide(plain.layer)),
            );
            // Another tab moves the version on by five, then closes.
            const before = (yield* Effect.promise(database.open)).version;
            const otherTab = yield* openTab(indexedDB, 'board', before + 5);
            otherTab.close();
            // Read the task through the original connection.
            const survivor = yield* stamped(
              plainTask
                .get({ taskId: 't1', boardId: 'work' })
                .pipe(Effect.provide(plain.layer)),
            );
            const after = (yield* Effect.promise(database.open)).version;
            yield* Story.assert(
              'the task reads back through the reopened connection',
              survivor?.value.title === 'Survives',
            );
            yield* Story.assert(
              'which now sees the version the other tab set',
              after === before + 5,
            );
            return { before, after, survivor };
          }),
        ),
      },
    ),
  ],
});
