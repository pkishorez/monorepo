import { eq } from '@tanstack/react-db';
import { Duration, Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  todoEntity,
  todoSource,
  type Todo,
} from '../support.js';

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

const waitUntil = (predicate: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return true;
      yield* Effect.sleep(Duration.millis(5));
    }
    return false;
  });

const makeTotalSimulation = (leadership: boolean) => {
  const counters = { readers: 0 };
  const simulation = Simulation.make({
    table: storyTable,
    ...(leadership ? { leadership: Simulation.inMemory() } : {}),
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
                    live({
                      open: ({ cursor }) =>
                        Stream.unwrap(
                          Effect.sync(() => {
                            counters.readers += 1;
                            return inbox.changes(cursor);
                          }),
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
  return { counters, simulation };
};

const withoutLeadership = makeTotalSimulation(false);
const withLeadership = makeTotalSimulation(true);

const partitions = (() => {
  const activated: string[] = [];
  const simulation = Simulation.make({
    table: storyTable,
    leadership: Simulation.inMemory(),
    collections: [
      Simulation.collection({
        entity: todoEntity,
        configure: ({ backend }) => ({
          sync: {
            partitions: {
              listId: (listId) => {
                const value = String(listId);
                const source = todoSource(backend, value);
                return {
                  strategy: syncStrategy.oldToNew<Todo>({
                    source: ({ live }) =>
                      live({
                        open: ({ cursor }) =>
                          Stream.unwrap(
                            Effect.sync(() => {
                              activated.push(value);
                              return source.changes(cursor);
                            }),
                          ),
                      }),
                  }),
                };
              },
            },
          },
        }),
      }),
    ] as const,
  });
  return { activated, simulation };
})();

type WithLeadershipWorld = Parameters<
  Parameters<typeof withLeadership.simulation.run>[0]
>[0];
type StoryBrowser = ReturnType<WithLeadershipWorld['browser']>;
type StoryTab = ReturnType<StoryBrowser['tab']>;

const mountInbox = (tab: StoryTab, name: string) =>
  tab.mount({
    name,
    query: (q) => q.from({ todo: tab.collection('Todo') }),
  });

export const oneReaderManyTabs = Story.make({
  title: 'One reader, many tabs',
  description:
    'Many tabs, one backend reader — but only when a leadership layer is supplied.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Is Leadership automatic?', {
      answer:
        'No. Without an explicitly supplied Leadership layer, every tab owns its normal backend reader. Supplying one shared In-memory Leadership layer makes matching readers compete for one identity.',
      proof: Effect.gen(function* () {
        withoutLeadership.counters.readers = 0;
        yield* withoutLeadership.simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            yield* backend.insert('Todo', milk);
            const first = browser('alice');
            const second = first.tab('second');
            const left = yield* mountInbox(first, 'left');
            const right = yield* mountInbox(second, 'right');
            yield* left.eventuallyShows([milk]);
            yield* right.eventuallyShows([milk]);
          }),
        );

        withLeadership.counters.readers = 0;
        yield* withLeadership.simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            yield* backend.insert('Todo', milk);
            const first = browser('alice');
            const second = first.tab('second');
            const left = yield* mountInbox(first, 'left');
            const right = yield* mountInbox(second, 'right');
            yield* left.eventuallyShows([milk]);
            yield* right.eventuallyShows([milk]);
          }),
        );

        yield* Story.assert(
          'two readers ran without Leadership',
          withoutLeadership.counters.readers === 2,
        );
        yield* Story.assert(
          'one reader ran with explicit Leadership',
          withLeadership.counters.readers === 1,
        );
      }),
    }),
    Story.question('Do ten matching tabs share one backend reader?', {
      answer:
        'Yes. All ten tabs use the same Std Sync name, Collection, total partition, and Strategy name. One owns that exact Leadership identity; the other nine remain waiting while Peer Sync keeps their replicas fresh.',
      proof: withLeadership.simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          withLeadership.counters.readers = 0;
          yield* backend.insert('Todo', milk);
          const first = browser('alice');
          const tabs = [
            first,
            ...Array.from({ length: 9 }, (_, index) =>
              first.tab(`tab-${index + 2}`),
            ),
          ];
          const queries = yield* Effect.forEach(tabs, (tab, index) =>
            mountInbox(tab, `inbox-${index + 1}`),
          );
          yield* Effect.forEach(queries, (query) =>
            query.eventuallyShows([milk]),
          );
          yield* Story.assert(
            'all ten matching tabs used one reader',
            withLeadership.counters.readers === 1,
          );
          return { readers: withLeadership.counters.readers };
        }),
      ),
    }),
    Story.question('Can different partitions lead independently?', {
      answer:
        'Yes. Leadership is exact, not collection-wide. Work and home have different partition identities, so both readers can stay active while duplicate readers for either partition would wait.',
      proof: partitions.simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          partitions.activated.length = 0;
          const work = { ...milk, todoId: 'w1', listId: 'work' };
          const home = { ...dog, todoId: 'h1', listId: 'home' };
          yield* backend.insert('Todo', work);
          yield* backend.insert('Todo', home);
          const first = browser('alice');
          const second = first.tab('second');
          const workQuery = yield* first.mount({
            name: 'work',
            query: (q) =>
              q
                .from({ todo: first.collection('Todo') })
                .where(({ todo }) => eq(todo.listId, 'work')),
          });
          const homeQuery = yield* second.mount({
            name: 'home',
            query: (q) =>
              q
                .from({ todo: second.collection('Todo') })
                .where(({ todo }) => eq(todo.listId, 'home')),
          });
          yield* workQuery.eventuallyShows([work]);
          yield* homeQuery.eventuallyShows([home]);
          yield* Story.assert(
            'work and home each owned an independent reader',
            new Set(partitions.activated).size === 2,
          );
          return { partitions: partitions.activated };
        }),
      ),
    }),
    Story.question('Can a waiting tab still mutate data?', {
      answer:
        'Yes. Leadership wraps backend-reading roles only. A waiting tab can mutate normally; after backend confirmation, Peer Sync carries the accepted Entity to its sibling without changing reader ownership.',
      proof: withLeadership.simulation.run(({ browser }) =>
        Effect.gen(function* () {
          withLeadership.counters.readers = 0;
          const first = browser('alice');
          const second = first.tab('second');
          const left = yield* mountInbox(first, 'left');
          const right = yield* mountInbox(second, 'right');
          const leaderEntered = yield* waitUntil(
            () => withLeadership.counters.readers === 1,
          );
          yield* Story.assert('one reader acquired Leadership', leaderEntered);
          yield* second.insert('Todo', dog);
          yield* left.eventuallyShows([dog]);
          yield* right.eventuallyShows([dog]);
          yield* Story.assert(
            'the mutation did not start another reader',
            withLeadership.counters.readers === 1,
          );
          return right.toArray;
        }),
      ),
    }),
    Story.question('Does closing the leader hand the work to a follower?', {
      answer:
        'Yes. Closing the owning tab disposes its Std Sync and releases the identity. The first waiting tab then acquires Leadership and resumes the backend stream from its own persisted Sync State.',
      proof: withLeadership.simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          withLeadership.counters.readers = 0;
          const first = browser('alice');
          yield* mountInbox(first, 'left');
          const firstEntered = yield* waitUntil(
            () => withLeadership.counters.readers === 1,
          );
          yield* Story.assert('the first tab became leader', firstEntered);

          const second = first.tab('second');
          const right = yield* mountInbox(second, 'right');
          yield* first.close;
          const handedOff = yield* waitUntil(
            () => withLeadership.counters.readers === 2,
          );
          yield* Story.assert('the waiting tab took over', handedOff);
          yield* backend.insert('Todo', dog);
          yield* right.eventuallyShows([dog]);
          return { readers: withLeadership.counters.readers };
        }),
      ),
    }),
  ],
});
