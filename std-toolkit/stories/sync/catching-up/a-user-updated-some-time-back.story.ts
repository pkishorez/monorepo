import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  todoEntity,
  todoSource,
  type Todo,
  type TodoEntity,
} from '../support.js';

const batches: string[][] = [];
const simulation = Simulation.make({
  table: storyTable,
  collections: [
    Simulation.collection({
      entity: todoEntity,
      configure: ({ backend }) => {
        const inbox = todoSource(backend, 'inbox');
        return {
          sync: {
            total: {
              strategy: syncStrategy.oldToNew<Todo>({
                source: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      inbox.pageNewer(cursor, 2).pipe(
                        Effect.tap((page: readonly TodoEntity[]) =>
                          Effect.sync(() => {
                            if (page.length > 0) {
                              batches.push(
                                page.map((entity) => entity.meta._u),
                              );
                            }
                          }),
                        ),
                        Effect.map((page) => [...page]),
                      ),
                  }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

const history: Todo[] = [
  { todoId: 't1', listId: 'inbox', title: 'Buy milk', done: true },
  { todoId: 't2', listId: 'inbox', title: 'Walk dog', done: false },
  { todoId: 't3', listId: 'inbox', title: 'Write report', done: false },
];

const seed = (
  backend: Parameters<Parameters<typeof simulation.run>[0]>[0]['backend'],
) =>
  Effect.gen(function* () {
    yield* backend.insert('Todo', { ...history[0]!, done: false });
    yield* backend.insert('Todo', history[1]!);
    yield* backend.insert('Todo', history[2]!);
    yield* backend.update(
      'Todo',
      { todoId: 't1', listId: 'inbox' },
      { done: true },
    );
  });

export const aUserUpdatedSomeTimeBack = Story.make({
  title: 'Backend history before mount',
  description: 'A browser that has been away finds history waiting for it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'History exists before the Browser mounts. Does it catch up?',
      {
        answer:
          'Yes. Backend history exists independently of any Browser. Mounting the Live Query starts the Collection and its old-to-new worker, which pages forward until the query shows the current rows.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            batches.length = 0;
            yield* seed(backend);
            const alice = browser('alice');
            const inbox = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ todo: alice.collection('Todo') }),
            });
            yield* inbox.eventuallyShows(history);
            yield* Story.assert(
              'history arrived in multiple pages',
              batches.length > 1,
            );
            const stamps = batches.flat();
            yield* Story.assert(
              'pages moved oldest to newest',
              stamps.every(
                (stamp, index) => index === 0 || stamps[index - 1]! < stamp,
              ),
            );
            return { batches, rows: inbox.toArray };
          }),
        ),
      },
    ),
    Story.question('Does an old deletion stay deleted after catch-up?', {
      answer:
        'Yes. The Backend retains the tombstone and the worker replays it, but the Live Query shows only live rows.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          batches.length = 0;
          yield* seed(backend);
          yield* backend.remove('Todo', {
            todoId: 't2',
            listId: 'inbox',
          });
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          yield* inbox.eventuallyShows(
            history.filter((todo) => todo.todoId !== 't2'),
          );
          return inbox.toArray;
        }),
      ),
    }),
  ],
});
