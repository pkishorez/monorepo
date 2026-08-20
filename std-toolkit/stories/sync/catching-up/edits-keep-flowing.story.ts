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

const counters = { fetches: 0 };
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
              strategy: syncStrategy.bidirectional<Todo>({
                newer: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      Effect.suspend(() => {
                        counters.fetches += 1;
                        return inbox.pageNewer(cursor, 2);
                      }).pipe(Effect.map((page) => [...page])),
                  }),
                older: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      Effect.suspend(() => {
                        counters.fetches += 1;
                        return inbox.pageOlder(cursor, 2);
                      }).pipe(Effect.map((page) => [...page])),
                  }),
                tail: ({ live }) =>
                  live({ open: ({ cursor }) => inbox.changes(cursor) }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

const history: Todo[] = [
  { todoId: 't1', listId: 'inbox', title: 'Buy milk', done: false },
  { todoId: 't2', listId: 'inbox', title: 'Walk dog', done: false },
  { todoId: 't3', listId: 'inbox', title: 'Write report', done: false },
  { todoId: 't4', listId: 'inbox', title: 'Book flights', done: false },
  { todoId: 't5', listId: 'inbox', title: 'Call plumber', done: false },
];

export const editsKeepFlowing = Story.make({
  title: 'Edits keep flowing',
  description:
    'A gap is closed from both ends at once — newest first and oldest last.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does bidirectional sync swallow a backlog?', {
      answer:
        'The Browser mounts after five Backend writes. Bidirectional sync loads the newest and oldest edges immediately and closes the gap from both directions.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          counters.fetches = 0;
          yield* Effect.forEach(history, (todo) =>
            backend.insert('Todo', todo),
          );
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          yield* inbox.eventuallyShows(history);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('After catch-up, does a fresh edit use the live tail?', {
      answer:
        'Yes. The mounted query stays active. A later Backend edit arrives through the live subscription without rerunning the historical fetches.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          counters.fetches = 0;
          yield* Effect.forEach(history, (todo) =>
            backend.insert('Todo', todo),
          );
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          yield* inbox.eventuallyShows(history);
          const fetchesAfterCatchUp = counters.fetches;
          const updated = history.map((todo) =>
            todo.todoId === 't3'
              ? { ...todo, title: 'Write report (final)', done: true }
              : todo,
          );
          yield* backend.update(
            'Todo',
            { todoId: 't3', listId: 'inbox' },
            { title: 'Write report (final)', done: true },
          );
          yield* inbox.eventuallyShows(updated);
          yield* Story.assert(
            'the historical fetch count stayed still',
            counters.fetches === fetchesAfterCatchUp,
          );
          return { fetches: counters.fetches, rows: inbox.toArray };
        }),
      ),
    }),
  ],
});
