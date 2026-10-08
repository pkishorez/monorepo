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
    'Only one tab reads the backend, and another takes over when it closes',
  description:
    'Two Tabs on one Device: only Tab 1 reads the backend. When Tab 1 goes away, Tab 2 takes over, starts reading, and picks up a task someone else stored on the backend.',
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
      const first = yield* browser.open('desktop', 'Tab 1');
      yield* first.waitFor(
        'Tab 1 leads the reading',
        '[data-testid=role] >> text="Leading"',
      );
      const second = yield* first.device.open('Tab 2');
      yield* second.waitFor(
        'Tab 2 shows the board',
        '[data-testid=task] >> nth=1',
      );
      const onScreen = {
        first: yield* first.text('[data-testid=role]'),
        second: yield* second.text('[data-testid=role]'),
        secondReads: yield* second.text('[data-testid=reads]'),
      };
      yield* Proof.assert('Tab 1 leads', onScreen.first === 'Leading');
      yield* Proof.assert('Tab 2 follows', onScreen.second === 'Not leading');
      yield* Proof.assert(
        'Tab 2 has not read the backend',
        onScreen.secondReads === 'Backend reads: 0',
      );
      return { first, second, onScreen };
    }),
  act: ({ first, second }) =>
    Effect.gen(function* () {
      yield* first.close('Close the leading Tab');
      yield* second.waitFor(
        'Tab 2 takes over the reading',
        '[data-testid=role] >> text="Leading"',
      );
      yield* second.click(
        'Someone else stores a task on the backend',
        'role=button[name="Someone else adds a task"]',
      );
      yield* second.waitFor(
        'Tab 2 reads it from the backend',
        '[data-testid=task] >> text=Added elsewhere',
      );
      return {
        role: yield* second.text('[data-testid=role]'),
        reads: yield* second.text('[data-testid=reads]'),
        tasks: yield* second.text('ul >> nth=0'),
      };
    }),
  verify: (seen) =>
    Effect.gen(function* () {
      yield* Proof.assert('Tab 2 now leads', seen.role === 'Leading');
      yield* Proof.assert(
        'Tab 2 reads the backend itself',
        seen.reads !== 'Backend reads: 0',
      );
      yield* Proof.assert(
        'Tab 2 shows the task someone else stored',
        seen.tasks.includes('Added elsewhere'),
      );
    }),
});
