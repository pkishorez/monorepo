import { eq } from '@tanstack/react-db';
import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  noteEntity,
  noteSource,
  type Note,
} from '../support.js';

const activated: string[] = [];
const simulation = Simulation.make({
  table: storyTable,
  collections: [
    Simulation.collection({
      entity: noteEntity,
      configure: ({ backend }) => ({
        sync: {
          partitions: {
            notebook: (notebook) => {
              const value = String(notebook);
              activated.push(value);
              const source = noteSource(backend, value);
              return {
                strategy: syncStrategy.oldToNew<Note>({
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
  noteId: 'w1',
  notebook: 'work',
  title: 'Ship release',
  pinned: false,
};
const home = {
  noteId: 'h1',
  notebook: 'home',
  title: 'Fix faucet',
  pinned: false,
};

export const oneListAtATime = Story.make({
  title: 'One list at a time',
  description:
    'Only the partition that a mounted query asks for becomes active.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Does mounting a query for one notebook sync that notebook only?',
      {
        answer:
          'Yes. Mounting the query subscribes to the collection. The collection sends the notebook filter down to the Note source, and only that partition becomes active.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            activated.length = 0;
            yield* backend.insert('Note', work);
            yield* backend.insert('Note', home);
            const alice = browser('alice');
            const workNotes = yield* alice.mount({
              name: 'work',
              query: (q) =>
                q
                  .from({ note: alice.collection('Note') })
                  .where(({ note }) => eq(note.notebook, 'work')),
            });
            yield* workNotes.eventuallyShows([work]);
            yield* Story.assert(
              'only work activated',
              sameNames(activated, ['work']),
            );
            return { activated, rows: workNotes.toArray };
          }),
        ),
      },
    ),
    Story.question('What happens while the live query is not mounted?', {
      answer:
        'The subscription ends and the partition unloads. The backend continues to accept writes. Mounting again makes a new subscription, and the worker reads what the tab missed.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          activated.length = 0;
          yield* backend.insert('Note', work);
          const alice = browser('alice');
          const query = () =>
            alice.mount({
              name: 'work',
              query: (q) =>
                q
                  .from({ note: alice.collection('Note') })
                  .where(({ note }) => eq(note.notebook, 'work')),
            });
          const firstMount = yield* query();
          yield* firstMount.eventuallyShows([work]);
          yield* alice.unmount(firstMount);
          const second = {
            noteId: 'w2',
            notebook: 'work',
            title: 'Publish notes',
            pinned: false,
          };
          yield* backend.insert('Note', second);
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
    Story.question('Can two notebook queries stay mounted together?', {
      answer:
        'Yes. Two notebooks are two independent live queries. They start two independent workers inside the Note collection of Alice.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          activated.length = 0;
          yield* backend.insert('Note', work);
          yield* backend.insert('Note', home);
          const alice = browser('alice');
          const workNotes = yield* alice.mount({
            name: 'work',
            query: (q) =>
              q
                .from({ note: alice.collection('Note') })
                .where(({ note }) => eq(note.notebook, 'work')),
          });
          const homeNotes = yield* alice.mount({
            name: 'home',
            query: (q) =>
              q
                .from({ note: alice.collection('Note') })
                .where(({ note }) => eq(note.notebook, 'home')),
          });
          yield* workNotes.eventuallyShows([work]);
          yield* homeNotes.eventuallyShows([home]);
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
