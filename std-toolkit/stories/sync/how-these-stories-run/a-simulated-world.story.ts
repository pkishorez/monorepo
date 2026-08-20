import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import { Simulation, storyTable, todoEntity, todoSource } from '../support.js';

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
              strategy: syncStrategy.oldToNew({
                source: ({ live }) =>
                  live({ open: ({ cursor }) => inbox.changes(cursor) }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

export const aSimulatedWorld = Story.make({
  title: 'A simulated world',
  description:
    'One backend, any number of browsers, and the vocabulary every Sync Story is written in.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Who is talking in these stories?', {
      answer:
        'One Backend and any number of Browsers share one conversation. Each Browser owns its own Collections, Live Queries, Sync Replica, and Sync Workers.\n\n' +
        'This story mounts Alice’s inbox query, writes one todo at the Backend, and observes it through the real live-query subscription. The flow uses one story id, so Backend, Browser, query, Collection, and worker activity appear together.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const todos = alice.collection('Todo');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: todos }),
          });
          const todo = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Buy milk',
            done: false,
          };
          yield* backend.insert('Todo', todo);
          yield* inbox.eventuallyShows([todo]);
          yield* Story.assert(
            'the Collection belongs to the shared story flow',
            todos.utils.flowId().startsWith('sync-story::'),
          );
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('Can two Browsers observe the same Backend independently?', {
      answer:
        'Yes. Alice and Bob have separate runtimes and Collections; only the Backend is shared. A Backend write reaches both through their own Sync Workers.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const bob = browser('bob');
          const aliceInbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const bobInbox = yield* bob.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: bob.collection('Todo') }),
          });
          const todo = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Buy milk',
            done: false,
          };
          yield* backend.insert('Todo', todo);
          yield* aliceInbox.eventuallyShows([todo]);
          yield* bobInbox.eventuallyShows([todo]);
          return {
            alice: aliceInbox.toArray,
            bob: bobInbox.toArray,
          };
        }),
      ),
    }),
    Story.question('What does one Browser miss while it is disconnected?', {
      answer:
        'Only that Browser pauses. Alice stays current while Bob is offline. When Bob reconnects, his own Sync Worker catches up from the Backend and his Live Query reaches the same confirmed state.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const bob = browser('bob');
          const aliceInbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: alice.collection('Todo') }),
          });
          const bobInbox = yield* bob.mount({
            name: 'inbox',
            query: (q) => q.from({ todo: bob.collection('Todo') }),
          });
          const first = {
            todoId: 't1',
            listId: 'inbox',
            title: 'Before disconnect',
            done: false,
          };
          const missed = {
            todoId: 't2',
            listId: 'inbox',
            title: 'While Bob was away',
            done: false,
          };
          yield* backend.insert('Todo', first);
          yield* aliceInbox.eventuallyShows([first]);
          yield* bobInbox.eventuallyShows([first]);
          yield* bob.disconnect;
          yield* backend.insert('Todo', missed);
          yield* aliceInbox.eventuallyShows([first, missed]);
          yield* bobInbox.shows([first]);
          yield* bob.reconnect;
          yield* bobInbox.eventuallyShows([first, missed]);
          return {
            alice: aliceInbox.toArray,
            bob: bobInbox.toArray,
          };
        }),
      ),
    }),
  ],
});
