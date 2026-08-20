import { eq } from '@tanstack/react-db';
import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  todoEntity,
  todoSource,
  type Todo,
} from '../support.js';

const activated: string[] = [];
const simulation = Simulation.make({
  table: storyTable,
  collections: [
    Simulation.collection({
      entity: todoEntity,
      configure: ({ backend }) => ({
        sync: {
          partitions: {
            listId: (listId) => {
              const value = String(listId);
              activated.push(value);
              const source = todoSource(backend, value);
              return {
                strategy: syncStrategy.oldToNew<Todo>({
                  source: ({ live }) =>
                    live({ open: ({ cursor }) => source.changes(cursor) }),
                }),
              };
            },
          },
        },
      }),
    }),
  ] as const,
});

const work = {
  todoId: 'w1',
  listId: 'work',
  title: 'Ship release',
  done: false,
};
const home = {
  todoId: 'h1',
  listId: 'home',
  title: 'Fix faucet',
  done: false,
};

export const oneListAtATime = Story.make({
  title: 'One list at a time',
  description:
    'Only the partition a mounted query actually asks for is activated.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Does mounting one partition query sync only that list?', {
      answer:
        'Yes. Mounting the work Live Query subscribes to the real query Collection, which pushes its listId predicate into Todo and activates only the work partition.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          activated.length = 0;
          yield* backend.insert('Todo', work);
          yield* backend.insert('Todo', home);
          const alice = browser('alice');
          const workTodos = yield* alice.mount({
            name: 'work',
            query: (q) =>
              q
                .from({ todo: alice.collection('Todo') })
                .where(({ todo }) => eq(todo.listId, 'work')),
          });
          yield* workTodos.eventuallyShows([work]);
          yield* Story.assert(
            'only work activated',
            sameNames(activated, ['work']),
          );
          return { activated, rows: workTodos.toArray };
        }),
      ),
    }),
    Story.question('What happens while the Live Query is unmounted?', {
      answer:
        'Unmounting unsubscribes the real live-query Collection and unloads its partition. Backend writes continue independently. Remounting creates a fresh subscription and the worker catches up from persisted Sync State.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          activated.length = 0;
          yield* backend.insert('Todo', work);
          const alice = browser('alice');
          const query = () =>
            alice.mount({
              name: 'work',
              query: (q) =>
                q
                  .from({ todo: alice.collection('Todo') })
                  .where(({ todo }) => eq(todo.listId, 'work')),
            });
          const firstMount = yield* query();
          yield* firstMount.eventuallyShows([work]);
          yield* alice.unmount(firstMount);
          const second = {
            todoId: 'w2',
            listId: 'work',
            title: 'Publish notes',
            done: false,
          };
          yield* backend.insert('Todo', second);
          const secondMount = yield* query();
          yield* secondMount.eventuallyShows([work, second]);
          yield* Story.assert(
            'the work partition activated again',
            sameNames(activated, ['work', 'work']),
          );
          return { activated, rows: secondMount.toArray };
        }),
      ),
    }),
    Story.question('Can two partition queries stay mounted together?', {
      answer:
        'Yes. Work and home are independent Live Queries and activate independent workers inside Alice’s Todo Collection.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          activated.length = 0;
          yield* backend.insert('Todo', work);
          yield* backend.insert('Todo', home);
          const alice = browser('alice');
          const workTodos = yield* alice.mount({
            name: 'work',
            query: (q) =>
              q
                .from({ todo: alice.collection('Todo') })
                .where(({ todo }) => eq(todo.listId, 'work')),
          });
          const homeTodos = yield* alice.mount({
            name: 'home',
            query: (q) =>
              q
                .from({ todo: alice.collection('Todo') })
                .where(({ todo }) => eq(todo.listId, 'home')),
          });
          yield* workTodos.eventuallyShows([work]);
          yield* homeTodos.eventuallyShows([home]);
          yield* Story.assert(
            'both partitions activated',
            sameNames(activated, ['work', 'home']),
          );
          return { activated };
        }),
      ),
    }),
  ],
});

const sameNames = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(left) === JSON.stringify(right);
