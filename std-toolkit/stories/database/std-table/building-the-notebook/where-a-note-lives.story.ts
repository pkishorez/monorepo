import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema } from 'std-toolkit/eschema';

const table = StdTable.make('notebook').primary('pk', 'sk').build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  status: Schema.String,
}).build();

const note = table
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .build();

const onNotebook = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provide(Memory.make(table).layer),
    Effect.provideService(Ulid, () => 'u'),
  );

const seed = Effect.forEach(
  [
    { noteId: 'n1', notebook: 'work', title: 'Draft', status: 'open' },
    { noteId: 'n2', notebook: 'work', title: 'Review', status: 'open' },
    { noteId: 'n3', notebook: 'home', title: 'Groceries', status: 'open' },
  ],
  (value) => note.insert(value),
);

const idsOf = (page: { items: readonly { value: { noteId: string } }[] }) =>
  page.items.map(({ value }) => value.noteId);

export const whereANoteLives = Story.make({
  title: 'Where a note lives',
  description:
    'Step two. The Note is bound to the table. Its `notebook` field decides where a note goes.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Two notes are in the notebook called work. One note is in the notebook called home. What does the binding decide?',
      {
        answer:
          'It decides that `notebook` is the partition. Notes in one notebook stay together. Reading a whole notebook is therefore one query, not a scan of everything.',
        proof: onNotebook(
          Effect.gen(function* () {
            yield* seed;
            const work = yield* note.query('primary', {
              pk: { notebook: 'work' },
              '>=': null,
            });
            const home = yield* note.query('primary', {
              pk: { notebook: 'home' },
              '>=': null,
            });
            yield* Story.assert(
              'the partition is built from the notebook field',
              note.primary.pk.join() === 'notebook',
            );
            yield* Story.assert(
              'the two work notes came back together',
              idsOf(work).join() === 'n1,n2',
            );
            yield* Story.assert(
              'and the home note was not among them',
              idsOf(home).join() === 'n3',
            );
            return { work: idsOf(work), home: idsOf(home) };
          }),
        ),
      },
    ),
    Story.question('What orders the notes inside one notebook?', {
      answer:
        'The identity field that the Note declared. An entity always sorts by its own identity. Each note therefore has one address inside its notebook.',
      proof: onNotebook(
        Effect.gen(function* () {
          yield* seed;
          const matching = yield* note.query('primary', {
            pk: { notebook: 'work' },
            beginsWith: { noteId: 'n1' },
          });
          yield* Story.assert(
            'the sort key is the declared id field',
            note.primary.sk.join() === 'noteId',
          );
          yield* Story.assert(
            'so a note can be addressed by its own id',
            idsOf(matching).join() === 'n1',
          );
          return { sortKey: note.primary.sk, matching: idsOf(matching) };
        }),
      ),
    }),
  ],
});
