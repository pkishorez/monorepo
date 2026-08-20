import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  noteEntity,
  noteSource,
  type Note,
} from '../support.js';

const AuditSchema = EntityESchema.make('Audit', 'auditId', {
  noteId: Schema.String,
  message: Schema.String,
}).build();

const auditEntity = storyTable
  .entity(AuditSchema)
  .primary({ pk: ['noteId'] })
  .build();

const simulation = Simulation.make({
  table: storyTable,
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

const note = {
  noteId: 't1',
  notebook: 'inbox',
  title: 'Ship the simulation',
  pinned: false,
};

const audit = {
  auditId: 'a1',
  noteId: 't1',
  message: 'Note completed',
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
            yield* backend.insert('Note', note);
            const alice = browser('alice');
            const notes = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            const audits = yield* alice.mount({
              name: 'audit',
              query: (q) => q.from({ audit: alice.collection('Audit') }),
            });
            yield* notes.eventuallyShows([note]);

            const backendWrite = yield* backend.holdNextWrite;
            const transaction = yield* alice.transact(
              'Complete note and record audit',
              ({ collection }) => {
                collection('Note').update('t1', (draft) => {
                  draft.pinned = true;
                });
                collection('Audit').insert(audit);
              },
            );

            yield* notes.eventuallyShows([{ ...note, pinned: true }]);
            yield* audits.eventuallyShows([audit]);
            yield* backendWrite.succeed;
            yield* transaction.persisted;
            return { notes: notes.toArray, audits: audits.toArray };
          }),
        ),
      },
    ),
    Story.question('What does a failed Backend transaction do?', {
      answer:
        'TanStack DB removes the whole optimistic overlay. The Note returns to its confirmed value and the optimistic Audit row disappears; neither write reaches the Backend.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          yield* backend.insert('Note', note);
          const alice = browser('alice');
          const notes = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const audits = yield* alice.mount({
            name: 'audit',
            query: (q) => q.from({ audit: alice.collection('Audit') }),
          });
          yield* notes.eventuallyShows([note]);

          const backendWrite = yield* backend.holdNextWrite;
          const transaction = yield* alice.transact(
            'Fail note completion',
            ({ collection }) => {
              collection('Note').update('t1', (draft) => {
                draft.pinned = true;
              });
              collection('Audit').insert(audit);
            },
          );

          yield* notes.eventuallyShows([{ ...note, pinned: true }]);
          yield* audits.eventuallyShows([audit]);
          yield* backendWrite.fail(
            new Error('Backend rejected the transaction'),
          );
          yield* transaction.failed;
          yield* notes.eventuallyShows([note]);
          yield* audits.eventuallyShows([]);
          return { notes: notes.toArray, audits: audits.toArray };
        }),
      ),
    }),
  ],
});
