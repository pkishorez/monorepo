import { eq } from '@tanstack/react-db';
import { Duration, Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  noteEntity,
  noteSource,
  type Note,
} from '../support.js';

const milk: Note = {
  noteId: 't1',
  notebook: 'inbox',
  title: 'Buy milk',
  pinned: false,
};

const dog: Note = {
  noteId: 't2',
  notebook: 'inbox',
  title: 'Walk dog',
  pinned: false,
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
        entity: noteEntity,
        configure: ({ backend }) => {
          const inbox = noteSource(backend, 'inbox');
          return {
            sync: {
              total: {
                strategy: syncStrategy.oldToNew<Note>({
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
        entity: noteEntity,
        configure: ({ backend }) => ({
          sync: {
            partitions: {
              notebook: (notebook) => {
                const value = String(notebook);
                const source = noteSource(backend, value);
                return {
                  strategy: syncStrategy.oldToNew<Note>({
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
    query: (q) => q.from({ note: tab.collection('Note') }),
  });

export const oneReaderManyTabs = Story.make({
  title: 'One reader, many tabs',
  description: 'Many tabs, one backend reader. This needs a leadership layer.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Is leadership automatic?', {
      answer:
        'No. Without a leadership layer, each tab owns its normal backend reader. Supplying one shared layer makes the matching readers compete for one identity.',
      proof: Effect.gen(function* () {
        withoutLeadership.counters.readers = 0;
        yield* withoutLeadership.simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            yield* backend.insert('Note', milk);
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
            yield* backend.insert('Note', milk);
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
        'Yes. Each of the ten tabs uses the same name, collection, partition, and strategy. One tab owns that identity. The other nine wait, and peer sync keeps them current.',
      proof: withLeadership.simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          withLeadership.counters.readers = 0;
          yield* backend.insert('Note', milk);
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
    Story.question('Can two notebooks lead separately?', {
      answer:
        'Yes. Leadership is exact, not per collection. Two notebooks have two identities, so both readers can stay active. A second reader for either notebook would wait.',
      proof: partitions.simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          partitions.activated.length = 0;
          const work = { ...milk, noteId: 'w1', notebook: 'work' };
          const home = { ...dog, noteId: 'h1', notebook: 'home' };
          yield* backend.insert('Note', work);
          yield* backend.insert('Note', home);
          const first = browser('alice');
          const second = first.tab('second');
          const workQuery = yield* first.mount({
            name: 'work',
            query: (q) =>
              q
                .from({ note: first.collection('Note') })
                .where(({ note }) => eq(note.notebook, 'work')),
          });
          const homeQuery = yield* second.mount({
            name: 'home',
            query: (q) =>
              q
                .from({ note: second.collection('Note') })
                .where(({ note }) => eq(note.notebook, 'home')),
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
    Story.question('Can a tab that is waiting still write?', {
      answer:
        'Yes. Leadership covers the roles that read the backend only. A waiting tab writes in the normal way. After the backend confirms the write, peer sync carries the note to the other tab.',
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
          yield* second.insert('Note', dog);
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
    Story.question('Does closing the leader pass the work on?', {
      answer:
        'Yes. Closing the owning tab releases the identity. The first waiting tab then takes leadership and continues the backend stream from its own stored position.',
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
          yield* backend.insert('Note', dog);
          yield* right.eventuallyShows([dog]);
          return { readers: withLeadership.counters.readers };
        }),
      ),
    }),
  ],
});
