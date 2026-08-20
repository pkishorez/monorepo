import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema } from 'std-toolkit/eschema';

const table = StdTable.make('notebook')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  status: Schema.String,
}).build();

const note = table
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status', 'title'] })
  .build();

const onNotebook = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provide(Memory.make(table).layer),
    Effect.provideService(Ulid, () => 'u'),
  );

const seed = Effect.forEach(
  [
    { noteId: 'n1', notebook: 'work', title: 'Review', status: 'open' },
    { noteId: 'n2', notebook: 'work', title: 'Draft', status: 'done' },
    { noteId: 'n3', notebook: 'work', title: 'Archive', status: 'open' },
  ],
  (value) => note.insert(value),
);

const titlesOf = (page: { items: readonly { value: { title: string } }[] }) =>
  page.items.map(({ value }) => value.title);

export const aSecondWayToRead = Story.make({
  title: 'A second way to read',
  description:
    'Step three. The notebook must be read by title and by status, so the table gets two more key slots.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The screen lists notes in alphabetical order, not by identity. The primary key cannot do that. What is added?',
      {
        answer:
          'A second order over the same notes. It reuses the notebook as its partition and names `title` as the order. One notebook can then be read two ways, and it is stored one time.',
        proof: onNotebook(
          Effect.gen(function* () {
            yield* seed;
            const byTitle = yield* note.query('byTitle', {
              pk: { notebook: 'work' },
              '>=': null,
            });
            yield* Story.assert(
              'the second order reuses the primary partition',
              note.accessPatterns.byTitle.pk.join() === 'notebook',
            );
            yield* Story.assert(
              'and orders the same notes alphabetically',
              titlesOf(byTitle).join() === 'Archive,Draft,Review',
            );
            return { byTitle: titlesOf(byTitle) };
          }),
        ),
      },
    ),
    Story.question('How does the notebook group its notes by status?', {
      answer:
        'With a second index that brings its own partition key and its own sort key. Its key is `[status, title]`, so notes of one status stay together and sort by title inside that group.',
      proof: onNotebook(
        Effect.gen(function* () {
          yield* seed;
          const byStatus = yield* note.query('byStatus', {
            pk: { notebook: 'work' },
            '>=': null,
          });
          yield* Story.assert(
            'the pattern names both of its own key parts',
            note.accessPatterns.byStatus.pk.join() === 'notebook' &&
              note.accessPatterns.byStatus.sk.join() === 'status,title',
          );
          yield* Story.assert(
            'notes group by status, alphabetically inside each group',
            titlesOf(byStatus).join() === 'Draft,Archive,Review',
          );
          return { byStatus: titlesOf(byStatus) };
        }),
      ),
    }),
  ],
});
