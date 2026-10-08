import { useLiveQuery } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Proof } from 'laymos/story';
import type { Entity } from '@kstackz/std-toolkit/core';
import { StdTable } from '@kstackz/std-toolkit/db';
import { IDB } from '@kstackz/std-toolkit/db/idb';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import {
  createStdSync,
  strategy,
  type SyncStore,
} from '@kstackz/std-toolkit/sync';
import { Sync } from '@kstackz/std-toolkit/sync/idb';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  position: Schema.Number,
}).build();
type Task = typeof Task.Type;

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 18px/1.4 system-ui, sans-serif; color: #1f2933; background: #f4f5f7; }
  main { display: grid; grid-template-columns: 1fr 340px; gap: 32px; max-width: 1120px; margin: 0 auto; padding: 40px; }
  h1 { margin: 0 0 8px; font-size: 32px; }
  h2 { margin: 0 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; }
  .status { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .pill { padding: 4px 12px; border-radius: 999px; font-size: 15px; font-weight: 600; background: #e5e7eb; }
  .leader { background: #dbeafe; color: #1e40af; }
  .offline { background: #fee2e2; color: #991b1b; }
  form { display: flex; gap: 12px; margin-bottom: 20px; }
  input { flex: 1; font: inherit; padding: 12px 16px; border: 2px solid #d1d5db; border-radius: 10px; background: white; }
  button { font: inherit; font-weight: 600; padding: 12px 22px; border: 0; border-radius: 10px; background: #2563eb; color: white; cursor: pointer; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 16px; padding: 14px 20px; margin-bottom: 10px; background: white; border-radius: 12px; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
  li .title { flex: 1; }
  li.done .title { text-decoration: line-through; color: #9ca3af; }
  li button { padding: 6px 14px; font-size: 15px; background: #eef2ff; color: #3730a3; }
  li.done button { background: #dcfce7; color: #166534; }
  .empty { padding: 28px; text-align: center; color: #9ca3af; border: 2px dashed #d1d5db; border-radius: 12px; }
  .badge { font-size: 14px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
  .saving { background: #fef3c7; color: #92400e; }
  .saved { background: #f3f4f6; color: #4b5563; }
  .error { padding: 12px 16px; margin-bottom: 16px; border-radius: 10px; background: #fee2e2; color: #991b1b; font-weight: 600; }
  aside { padding: 20px; border-radius: 14px; background: #1f2933; color: #e5e7eb; align-self: start; }
  aside .note { margin: -8px 0 12px; font-size: 14px; color: #9ca3af; }
  aside li { background: #374151; color: white; box-shadow: none; padding: 10px 14px; font-size: 16px; }
  aside li.done .title { color: #9ca3af; }
  aside button { width: 100%; margin-top: 8px; background: #4b5563; }
`;

export default Proof.browser({
  title:
    'Offline, the board stays on screen and edits are undone; back online, it catches up',
  description:
    'The Device goes offline (Playwright setOffline). The board keeps showing its local copy; an edit cannot reach the backend, so it is rolled back with a message instead of pretending to be saved. Back online, the leader catches up on what changed meanwhile and new edits are confirmed. This version of Sync ships no Outbox: an offline edit is not queued.',
  critical: true,
  page: (root) => {
    const table = StdTable.make('board').primary('pk', 'sk').build();
    const tasks = table
      .entity(Task)
      .primary({ pk: ['boardId'] })
      .build();
    const backend = IDB.make(table, {
      database: IDB.database({ databaseName: 'backend' }),
    });
    // The backend sits one second of network away; offline, a request fails after that second.
    const network = Effect.sleep('1 second').pipe(
      Effect.andThen(
        Effect.suspend(() =>
          navigator.onLine ? Effect.void : Effect.fail(new Error('offline')),
        ),
      ),
    );
    const onBoard = (after: Entity<Task> | null) =>
      tasks
        .query(
          'primary',
          { pk: { boardId: 'work' }, '>=': null },
          { limit: 500 },
        )
        .pipe(
          Effect.map((page) =>
            page.items
              .filter((item) => after === null || item.meta._u > after.meta._u)
              .sort((a, b) => (a.meta._u < b.meta._u ? -1 : 1)),
          ),
          Effect.provide(backend.layer),
        );

    // What this tab does, so the screen can show it.
    const tab = { reads: 0, leading: new Set<string>(), error: '' };
    const store = Sync.idb();
    const watched: SyncStore = {
      ...store,
      leadership: {
        run: (key, effect) =>
          store.leadership.run(
            key,
            Effect.sync(() => tab.leading.add(key)).pipe(
              Effect.andThen(effect),
              Effect.ensuring(Effect.sync(() => tab.leading.delete(key))),
            ),
          ),
      },
    };

    const app = createStdSync({ name: 'tasks', store: watched });
    const collection = app.collection(Task, {
      sync: {
        global: strategy.oldToNew({
          fetch: ({ after }) =>
            Effect.suspend(() => {
              tab.reads += 1;
              return navigator.onLine
                ? onBoard(after)
                : Effect.fail(new Error('offline'));
            }),
          pollEvery: '500 millis',
        }),
      },
      onInsert: (items) =>
        network.pipe(
          Effect.andThen(Effect.forEach(items, (item) => tasks.insert(item))),
          Effect.provide(backend.layer),
        ),
      onUpdate: ({ current, updates }) =>
        network.pipe(
          Effect.andThen(
            tasks.getAndUpdate(
              { taskId: current.taskId, boardId: current.boardId },
              updates,
            ),
          ),
          Effect.provide(backend.layer),
        ),
    });

    const useTick = () => {
      const [, setTick] = useState(0);
      useEffect(() => {
        const timer = setInterval(() => setTick((tick) => tick + 1), 200);
        return () => clearInterval(timer);
      }, []);
    };

    const Backend = () => {
      const [stored, setStored] = useState<readonly Task[]>([]);
      useEffect(() => {
        const read = () =>
          void Effect.runPromise(onBoard(null)).then((items) =>
            setStored(
              items
                .map((item) => item.value)
                .sort((a, b) => a.position - b.position),
            ),
          );
        read();
        const timer = setInterval(read, 200);
        return () => clearInterval(timer);
      }, []);
      return (
        <aside data-testid="backend">
          <h2>Backend</h2>
          <p className="note">An IndexedDB StdTable in this browser</p>
          <p data-testid="backend-count">{stored.length} stored</p>
          <ul>
            {stored.map((task) => (
              <li
                key={task.taskId}
                className={task.done ? 'done' : ''}
                data-testid="stored"
              >
                <span className="title">{task.title}</span>
                <span>{task.done ? 'done' : 'open'}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() =>
              void Effect.runPromise(
                tasks
                  .insert({
                    taskId: crypto.randomUUID(),
                    boardId: 'work',
                    title: 'Added elsewhere',
                    done: false,
                    position: Date.now(),
                  })
                  .pipe(Effect.provide(backend.layer)),
              )
            }
          >
            Someone else adds a task
          </button>
        </aside>
      );
    };

    const Board = () => {
      useTick();
      const { data } = useLiveQuery((q) => q.from({ task: collection }));
      const [title, setTitle] = useState('');
      const rows = [...data].sort((a, b) => a.position - b.position);
      const report = (persisted: Promise<unknown>) =>
        persisted.then(
          () => (tab.error = ''),
          () =>
            (tab.error =
              'Not saved: the backend is out of reach, so the change was undone'),
        );
      return (
        <main>
          <section>
            <h1>Work board</h1>
            <div className="status">
              <span className="pill" data-testid="count">
                {rows.length} {rows.length === 1 ? 'task' : 'tasks'}
              </span>
              <span
                className={`pill ${tab.leading.size > 0 ? 'leader' : ''}`}
                data-testid="role"
              >
                {tab.leading.size > 0 ? 'Leading' : 'Not leading'}
              </span>
              <span className="pill" data-testid="reads">
                Backend reads: {tab.reads}
              </span>
              <span
                className={`pill ${navigator.onLine ? '' : 'offline'}`}
                data-testid="online"
              >
                {navigator.onLine ? 'Online' : 'Offline'}
              </span>
            </div>
            {tab.error === '' ? null : (
              <p className="error" data-testid="error">
                {tab.error}
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (title.trim() === '') return;
                void report(
                  collection.insert({
                    taskId: crypto.randomUUID(),
                    boardId: 'work',
                    title,
                    done: false,
                    position: Date.now(),
                  }).isPersisted.promise,
                );
                setTitle('');
              }}
            >
              <input
                data-testid="new-task"
                placeholder="What needs doing?"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <button type="submit">Add</button>
            </form>
            {rows.length === 0 ? (
              <p className="empty" data-testid="empty">
                No tasks yet
              </p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li
                    key={row.taskId}
                    className={row.done ? 'done' : ''}
                    data-testid="task"
                  >
                    <button
                      aria-label={`Toggle ${row.title}`}
                      onClick={() =>
                        void report(
                          collection.update(row.taskId, (draft) => {
                            draft.done = !draft.done;
                          }).isPersisted.promise,
                        )
                      }
                    >
                      {row.done ? 'Done' : 'Mark done'}
                    </button>
                    <span className="title">{row.title}</span>
                    <span
                      data-testid="sync"
                      className={`badge ${row.$synced === false ? 'saving' : 'saved'}`}
                    >
                      {row.$synced === false ? 'Saving…' : 'Saved'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Backend />
        </main>
      );
    };

    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const reactRoot = createRoot(root);
    // The backend already holds two tasks; a second Tab's copies are no-ops.
    void Effect.runPromise(
      Effect.forEach(
        [
          { taskId: 'plan', title: 'Write the plan', position: 1 },
          { taskId: 'review', title: 'Review it', position: 2 },
        ],
        (task) =>
          tasks
            .insert({ ...task, boardId: 'work', done: false })
            .pipe(Effect.ignore),
      ).pipe(Effect.provide(backend.layer)),
    ).then(() => reactRoot.render(<Board />));
    return () => {
      reactRoot.unmount();
      void app.dispose();
    };
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Tab 1');
      yield* tab.waitFor(
        'The board loads both tasks',
        '[data-testid=task] >> nth=1',
      );
      yield* tab.waitFor(
        'Tab 1 leads the reading',
        '[data-testid=role] >> text="Leading"',
      );
      const onScreen = {
        online: yield* tab.text('[data-testid=online]'),
        plan: yield* tab.text('[data-testid=task] >> nth=0'),
      };
      yield* Proof.assert('the Device is online', onScreen.online === 'Online');
      yield* Proof.assert(
        'the plan is open and saved',
        onScreen.plan.includes('Mark done') && onScreen.plan.includes('Saved'),
      );
      return { tab, onScreen };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      type Context = {
        context: () => { setOffline: (offline: boolean) => Promise<void> };
      };
      yield* tab.raw('The network goes away', (page) =>
        (page as Context).context().setOffline(true),
      );
      yield* tab.waitFor(
        'The page notices',
        '[data-testid=online] >> text=Offline',
      );
      const offlineBoard = yield* tab.text('ul >> nth=0');
      yield* tab.click(
        'Mark the plan done while offline',
        'role=button[name="Toggle Write the plan"]',
      );
      const offlineAtOnce = yield* tab.text('[data-testid=task] >> nth=0');
      yield* tab.waitFor('The edit is refused', '[data-testid=error]');
      const refused = {
        error: yield* tab.text('[data-testid=error]'),
        plan: yield* tab.text('[data-testid=task] >> nth=0'),
        backend: yield* tab.text('[data-testid=stored] >> nth=0'),
      };
      yield* tab.click(
        'Meanwhile someone else stores a task on the backend',
        'role=button[name="Someone else adds a task"]',
      );
      yield* tab.waitFor(
        'The backend has three tasks',
        '[data-testid=backend-count] >> text=3 stored',
      );
      const offlineCount = yield* tab.text('[data-testid=count]');
      yield* tab.raw('The network comes back', (page) =>
        (page as Context).context().setOffline(false),
      );
      yield* tab.waitFor(
        'The leader catches up on what it missed',
        '[data-testid=task] >> text=Added elsewhere',
      );
      yield* tab.click(
        'Mark the plan done again, online',
        'role=button[name="Toggle Write the plan"]',
      );
      yield* tab.waitFor(
        'The backend confirms it',
        '[data-testid=stored] >> nth=0 >> text=done',
      );
      yield* tab.waitFor(
        'The plan shows saved',
        '[data-testid=task] >> nth=0 >> text=Saved',
      );
      return {
        offlineBoard,
        offlineAtOnce,
        refused,
        offlineCount,
        online: {
          count: yield* tab.text('[data-testid=count]'),
          plan: yield* tab.text('[data-testid=task] >> nth=0'),
          backend: yield* tab.text('[data-testid=stored] >> nth=0'),
        },
      };
    }),
  verify: (seen) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'offline, the board still shows both tasks',
        seen.offlineBoard.includes('Write the plan') &&
          seen.offlineBoard.includes('Review it'),
      );
      yield* Proof.assert(
        'the offline edit showed at once, as saving',
        seen.offlineAtOnce.includes('Done') &&
          seen.offlineAtOnce.includes('Saving…'),
      );
      yield* Proof.assert(
        'then it was undone with a message, never shown as saved',
        seen.refused.error.startsWith('Not saved') &&
          seen.refused.plan.includes('Mark done') &&
          seen.refused.backend.includes('open'),
      );
      yield* Proof.assert(
        'offline, the task stored elsewhere did not arrive',
        seen.offlineCount === '2 tasks',
      );
      yield* Proof.assert(
        'online, it arrived and the edit was confirmed',
        seen.online.count === '3 tasks' &&
          seen.online.plan.includes('Done') &&
          seen.online.plan.includes('Saved') &&
          seen.online.backend.includes('done'),
      );
    }),
});
