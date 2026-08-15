import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/tanstack-sync';
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
                fetch: ({ cursor }) =>
                  inbox.pageNewer(cursor, 10).pipe(Effect.map((p) => [...p])),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

const milk: Todo = {
  todoId: 't1',
  listId: 'inbox',
  title: 'Buy milk',
  done: false,
};
const dog: Todo = {
  todoId: 't2',
  listId: 'inbox',
  title: 'Walk dog',
  done: false,
};

export const oneBrowserManyTabs = Story.make({
  title: 'Two Tabs, One Browser',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Alice opens a second tab. What does it show?', {
      answer:
        'Everything the first tab already synced. Both tabs share one Source of Truth, so the second tab hydrates by advancing its Projection Position from the beginning of the Projection Sequence — it never asks the Backend for a thing.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const first = yield* alice.mount({
            name: 'first-tab',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          yield* backend.insert('Todo', milk);
          yield* first.eventuallyShows([milk]);

          const second = alice.tab('second');
          const later = yield* second.mount({
            name: 'second-tab',
            query: (q) => q.from({ todo: second.collection('Todo') }),
          });
          yield* later.eventuallyShows([milk]);
          return later.toArray;
        }),
      ),
    }),
    Story.question('Alice adds a todo in one tab. Does the other tab see it?', {
      answer:
        'Yes. Only the tab that made the mutation writes the Source of Truth — the sibling tab never fetches this row, because both tabs share one sync cursor and it has already moved past. The writing tab emits a Change Notice, and the sibling advances its own Projection Position onto the row it never asked for.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const second = alice.tab('second');
          const left = yield* alice.mount({
            name: 'left',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const right = yield* second.mount({
            name: 'right',
            query: (q) => q.from({ todo: second.collection('Todo') }),
          });

          yield* alice.insert('Todo', milk);
          yield* left.eventuallyShows([milk]);
          yield* right.eventuallyShows([milk]);
          return right.toArray;
        }),
      ),
    }),
    Story.question('Alice edits a todo in one tab. Does the other follow?', {
      answer:
        'Yes. The edit stays optimistic in the tab that made it until the Backend confirms. The confirmed entity then lands in the shared Source of Truth, and a Change Notice carries the other tab forward — the other tab does no fetching of its own.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const second = alice.tab('second');
          const left = yield* alice.mount({
            name: 'left',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const right = yield* second.mount({
            name: 'right',
            query: (q) => q.from({ todo: second.collection('Todo') }),
          });
          yield* alice.insert('Todo', milk);
          yield* right.eventuallyShows([milk]);

          yield* second.update(
            'Todo',
            { todoId: 't1', listId: 'inbox' },
            { done: true },
          );
          yield* left.eventuallyShows([{ ...milk, done: true }]);
          return left.toArray;
        }),
      ),
    }),
    Story.question(
      'Alice removes a todo in one tab. Does it vanish in the other?',
      {
        answer:
          'Yes. The removal is stored as a tombstone, and a tombstone travels the same path as any other write — the other tab advances onto it and projects a delete.',
        proof: simulation.run(({ browser }) =>
          Effect.gen(function* () {
            const alice = browser('alice');
            const second = alice.tab('second');
            const left = yield* alice.mount({
              name: 'left',
              query: (q) => q.from({ todo: alice.collection('Todo') }),
            });
            const right = yield* second.mount({
              name: 'right',
              query: (q) => q.from({ todo: second.collection('Todo') }),
            });
            yield* alice.insert('Todo', milk);
            yield* alice.insert('Todo', dog);
            yield* right.eventuallyShows([milk, dog]);

            yield* second.remove('Todo', { todoId: 't1', listId: 'inbox' });
            yield* left.eventuallyShows([dog]);
            return left.toArray;
          }),
        ),
      },
    ),
    Story.question('Alice closes a tab. Does the other tab notice?', {
      answer:
        'Only in that the closed tab stops listening. A Projection Position lives and dies with its mount, and nothing about it is shared — so the surviving tab keeps advancing exactly as before, and a reopened tab rebuilds from the Source of Truth.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const second = alice.tab('second');
          const left = yield* alice.mount({
            name: 'left',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const right = yield* second.mount({
            name: 'right',
            query: (q) => q.from({ todo: second.collection('Todo') }),
          });
          yield* alice.insert('Todo', milk);
          yield* right.eventuallyShows([milk]);

          yield* second.unmount(right);
          yield* alice.insert('Todo', dog);
          yield* left.eventuallyShows([milk, dog]);

          const reopened = yield* second.mount({
            name: 'reopened',
            query: (q) => q.from({ todo: second.collection('Todo') }),
          });
          yield* reopened.eventuallyShows([milk, dog]);
          return reopened.toArray;
        }),
      ),
    }),
  ],
});
