import { eq, useLiveQuery } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Proof } from 'laymos/story';
import type { Entity } from '@kstackz/std-toolkit/core';
import { StdTable } from '@kstackz/std-toolkit/db';
import { IDB } from '@kstackz/std-toolkit/db/idb';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';
import { Sync } from '@kstackz/std-toolkit/sync/idb';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  position: Schema.Number,
}).build();
type Task = typeof Task.Type;

const boards = [
  { id: 'work', name: 'Work' },
  { id: 'home', name: 'Home' },
] as const;

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 18px/1.4 system-ui, sans-serif; color: #1f2933; background: #f4f5f7; }
  main { display: grid; grid-template-columns: 1fr 340px; gap: 32px; max-width: 1120px; margin: 0 auto; padding: 40px; }
  h1 { margin: 0 0 8px; font-size: 32px; }
  h2 { margin: 0 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; }
  .status { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .pill { padding: 4px 12px; border-radius: 999px; font-size: 15px; font-weight: 600; background: #e5e7eb; }
  .switcher { display: flex; gap: 8px; margin-bottom: 20px; }
  .switcher button { font: inherit; font-weight: 600; padding: 10px 24px; border: 2px solid #d1d5db; border-radius: 10px; background: white; color: #374151; cursor: pointer; }
  .switcher button[aria-pressed=true] { border-color: #2563eb; background: #2563eb; color: white; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 16px; padding: 14px 20px; margin-bottom: 10px; background: white; border-radius: 12px; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
  li .title { flex: 1; }
  .empty { padding: 28px; text-align: center; color: #9ca3af; border: 2px dashed #d1d5db; border-radius: 12px; }
  aside { padding: 20px; border-radius: 14px; background: #1f2933; color: #e5e7eb; align-self: start; }
  aside .note { margin: -8px 0 12px; font-size: 14px; color: #9ca3af; }
  aside li { background: #374151; color: white; box-shadow: none; padding: 10px 14px; font-size: 16px; }
  aside .board { font-size: 14px; color: #9ca3af; }
`;

export default Proof.browser({
  title: 'Opening a board loads only that board',
  description:
    'Tasks sync per board through a Window on `boardId`: the Work board reads only Work tasks from the backend (an IndexedDB StdTable in the page holding two boards). Switching to Home opens a Window for Home, which then loads, and the screen shows only Home tasks.',
  page: (root) => {
    const table = StdTable.make('board').primary('pk', 'sk').build();
    const tasks = table
      .entity(Task)
      .primary({ pk: ['boardId'] })
      .build();
    const backend = IDB.make(table, {
      database: IDB.database({ databaseName: 'backend' }),
    });
    const onBoard = (boardId: string, after: Entity<Task> | null) =>
      tasks
        .query('primary', { pk: { boardId }, '>=': null }, { limit: 500 })
        .pipe(
          Effect.map((page) =>
            page.items
              .filter((item) => after === null || item.meta._u > after.meta._u)
              .sort((a, b) => (a.meta._u < b.meta._u ? -1 : 1)),
          ),
          Effect.provide(backend.layer),
        );

    // How often this tab read each board from the backend.
    const reads: Record<string, number> = { work: 0, home: 0 };

    const app = createStdSync({ name: 'tasks', store: Sync.idb() });
    const collection = app.collection(Task, {
      sync: {
        windows: {
          boardId: (boardId) =>
            strategy.oldToNew({
              fetch: ({ after }) =>
                Effect.suspend(() => {
                  reads[boardId] = (reads[boardId] ?? 0) + 1;
                  return onBoard(boardId, after);
                }),
              pollEvery: '500 millis',
            }),
        },
      },
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
          void Effect.runPromise(
            Effect.forEach(boards, (board) => onBoard(board.id, null)),
          ).then((items) => setStored(items.flat().map((item) => item.value)));
        read();
        const timer = setInterval(read, 500);
        return () => clearInterval(timer);
      }, []);
      return (
        <aside data-testid="backend">
          <h2>Backend</h2>
          <p className="note">An IndexedDB StdTable in this browser</p>
          <p data-testid="backend-count">{stored.length} stored</p>
          <ul>
            {stored.map((task) => (
              <li key={task.taskId}>
                <span className="title">{task.title}</span>
                <span className="board">{task.boardId}</span>
              </li>
            ))}
          </ul>
        </aside>
      );
    };

    const Board = () => {
      useTick();
      const [board, setBoard] = useState<string>('work');
      const { data } = useLiveQuery(
        (q) =>
          q
            .from({ task: collection })
            .where(({ task }) => eq(task.boardId, board)),
        [board],
      );
      const rows = [...data].sort((a, b) => a.position - b.position);
      return (
        <main>
          <section>
            <h1>Boards</h1>
            <div className="switcher">
              {boards.map(({ id, name }) => (
                <button
                  key={id}
                  aria-pressed={board === id}
                  onClick={() => setBoard(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="status">
              <span className="pill" data-testid="count">
                {rows.length} on this board
              </span>
              <span className="pill" data-testid="copy">
                This tab holds {collection.size}
              </span>
              <span className="pill" data-testid="reads">
                Reads: Work {reads.work}, Home {reads.home}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="empty" data-testid="empty">
                Loading…
              </p>
            ) : (
              <ul data-testid="tasks">
                {rows.map((row) => (
                  <li key={row.taskId} data-testid="task">
                    <span className="title">{row.title}</span>
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
    // The backend holds three Work tasks and two Home tasks.
    void Effect.runPromise(
      Effect.forEach(
        [
          { taskId: 'plan', boardId: 'work', title: 'Write the plan' },
          { taskId: 'review', boardId: 'work', title: 'Review it' },
          { taskId: 'ship', boardId: 'work', title: 'Ship it' },
          { taskId: 'groceries', boardId: 'home', title: 'Buy groceries' },
          { taskId: 'laundry', boardId: 'home', title: 'Do the laundry' },
        ],
        (task, position) =>
          tasks.insert({ ...task, done: false, position }).pipe(Effect.ignore),
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
      yield* tab.waitFor('The Work board loads', '[data-testid=task] >> nth=2');
      yield* tab.waitFor(
        'The backend holds both boards',
        '[data-testid=backend-count] >> text=5 stored',
      );
      const onScreen = {
        tasks: yield* tab.text('[data-testid=tasks]'),
        copy: yield* tab.text('[data-testid=copy]'),
        reads: yield* tab.text('[data-testid=reads]'),
      };
      yield* Proof.assert(
        'the Work board shows its three tasks',
        (yield* tab.count('[data-testid=task]')) === 3 &&
          onScreen.tasks.includes('Ship it'),
      );
      yield* Proof.assert(
        'this tab holds only the Work tasks',
        onScreen.copy === 'This tab holds 3',
      );
      yield* Proof.assert(
        'the Home board was never read',
        onScreen.reads.endsWith('Home 0'),
      );
      return { tab, onScreen };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.click('Open the Home board', 'role=button[name="Home"]');
      yield* tab.waitFor(
        'The Home board loads',
        '[data-testid=task] >> text=Buy groceries',
      );
      const home = {
        count: yield* tab.count('[data-testid=task]'),
        tasks: yield* tab.text('[data-testid=tasks]'),
        reads: yield* tab.text('[data-testid=reads]'),
        copy: yield* tab.text('[data-testid=copy]'),
      };
      yield* tab.click('Back to the Work board', 'role=button[name="Work"]');
      yield* tab.waitFor(
        'The Work board shows again',
        '[data-testid=task] >> text=Ship it',
      );
      const work = {
        count: yield* tab.count('[data-testid=task]'),
        tasks: yield* tab.text('[data-testid=tasks]'),
      };
      return { home, work };
    }),
  verify: (seen) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the Home board shows only its two tasks',
        seen.home.count === 2 &&
          seen.home.tasks.includes('Buy groceries') &&
          seen.home.tasks.includes('Do the laundry') &&
          !seen.home.tasks.includes('Write the plan'),
      );
      yield* Proof.assert(
        'opening Home made this tab read the Home board',
        !seen.home.reads.endsWith('Home 0'),
      );
      yield* Proof.assert(
        'back on Work, only its three tasks show',
        seen.work.count === 3 && !seen.work.tasks.includes('Buy groceries'),
      );
    }),
});
