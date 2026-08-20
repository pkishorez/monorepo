import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  todoEntity,
  todoSource,
  type Todo,
} from '../support.js';

const AuditSchema = EntityESchema.make('Audit', 'auditId', {
  todoId: Schema.String,
  message: Schema.String,
}).build();

const auditEntity = storyTable
  .entity(AuditSchema)
  .primary({ pk: ['todoId'] })
  .build();

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
                source: ({ live }) =>
                  live({ open: ({ cursor }) => inbox.changes(cursor) }),
              }),
            },
          },
        };
      },
    }),
    Simulation.collection({
      entity: auditEntity,
      configure: () => ({}),
    }),
  ] as const,
});

const todo = {
  todoId: 't1',
  listId: 'inbox',
  title: 'Ship the simulation',
  done: false,
};

const audit = {
  auditId: 'a1',
  todoId: 't1',
  message: 'Todo completed',
};

export const crossCollection = Story.make({
  title: 'Cross-collection optimistic actions',
  description:
    'Two collections mutated in one transaction, shown immediately and confirmed together.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Do all optimistic changes appear before the Backend commits?',
      {
        answer:
          'Yes. The Browser uses TanStack DB’s optimistic action and mutates both real Collections in one ambient transaction. Both Live Queries update immediately; one Backend transaction then persists and confirms them together.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            yield* backend.insert('Todo', todo);
            const alice = browser('alice');
            const todos = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ todo: alice.collection('Todo') }),
            });
            const audits = yield* alice.mount({
              name: 'audit',
              query: (q) => q.from({ audit: alice.collection('Audit') }),
            });
            yield* todos.eventuallyShows([todo]);

            const backendWrite = yield* backend.holdNextWrite;
            const transaction = yield* alice.transact(
              'Complete todo and record audit',
              ({ collection }) => {
                collection('Todo').update('t1', (draft) => {
                  draft.done = true;
                });
                collection('Audit').insert(audit);
              },
            );

            yield* todos.eventuallyShows([{ ...todo, done: true }]);
            yield* audits.eventuallyShows([audit]);
            yield* backendWrite.succeed;
            yield* transaction.persisted;
            return { todos: todos.toArray, audits: audits.toArray };
          }),
        ),
      },
    ),
    Story.question('What does a failed Backend transaction do?', {
      answer:
        'TanStack DB removes the whole optimistic overlay. The Todo returns to its confirmed value and the optimistic Audit row disappears; neither write reaches the Backend.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          yield* backend.insert('Todo', todo);
          const alice = browser('alice');
          const todos = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const audits = yield* alice.mount({
            name: 'audit',
            query: (q) => q.from({ audit: alice.collection('Audit') }),
          });
          yield* todos.eventuallyShows([todo]);

          const backendWrite = yield* backend.holdNextWrite;
          const transaction = yield* alice.transact(
            'Fail todo completion',
            ({ collection }) => {
              collection('Todo').update('t1', (draft) => {
                draft.done = true;
              });
              collection('Audit').insert(audit);
            },
          );

          yield* todos.eventuallyShows([{ ...todo, done: true }]);
          yield* audits.eventuallyShows([audit]);
          yield* backendWrite.fail(
            new Error('Backend rejected the transaction'),
          );
          yield* transaction.failed;
          yield* todos.eventuallyShows([todo]);
          yield* audits.eventuallyShows([]);
          return { todos: todos.toArray, audits: audits.toArray };
        }),
      ),
    }),
  ],
});
