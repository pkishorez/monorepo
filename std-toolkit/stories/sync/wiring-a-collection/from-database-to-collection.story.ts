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
                stream: ({ cursor }) => Effect.succeed(inbox.changes(cursor)),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

export const fromDatabaseToCollection = Story.make({
  title: 'From Backend to Browser',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('The Backend creates a todo. What does the Browser see?', {
      answer:
        'The Backend persists the entity, the Sync Worker delivers it into the Browser’s Source of Truth, the Collection projects it, and the mounted Live Query shows it.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const todo = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Buy milk',
            done: false,
          };
          yield* backend.insert('Todo', todo);
          yield* inbox.eventuallyShows([todo]);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('Can the Browser create the todo instead?', {
      answer:
        'Yes. Alice inserts into her named Todo Collection. TanStack DB applies the optimistic row, Std Sync persists the intent through the Backend, and the confirmed entity replaces it in Alice’s Source of Truth.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const todo = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Buy milk',
            done: false,
          };
          yield* alice.insert('Todo', todo);
          yield* inbox.eventuallyShows([todo]);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('The Browser updates a todo. Does it reach the Backend?', {
      answer:
        'Yes. Alice mutates her named Todo Collection. Std Sync sends the direct mutation to the Backend and writes the confirmed entity into Alice’s Source of Truth.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const todo = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Buy milk',
            done: false,
          };
          yield* backend.insert('Todo', todo);
          yield* inbox.eventuallyShows([todo]);
          yield* alice.update(
            'Todo',
            { todoId: 't1', listId: 'inbox' },
            { done: true },
          );
          yield* inbox.eventuallyShows([{ ...todo, done: true }]);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('The Browser removes a todo. What remains?', {
      answer:
        'The Backend and Browser Source of Truth retain a tombstone, while the mounted Live Query no longer shows the row.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const todo = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Buy milk',
            done: false,
          };
          yield* backend.insert('Todo', todo);
          yield* inbox.eventuallyShows([todo]);
          yield* alice.remove('Todo', {
            todoId: 't1',
            listId: 'inbox',
          });
          yield* inbox.eventuallyShows([]);
          return inbox.toArray;
        }),
      ),
    }),
  ],
});
