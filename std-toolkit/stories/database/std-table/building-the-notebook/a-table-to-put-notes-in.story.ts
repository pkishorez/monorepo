import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';

const table = StdTable.make('notebook').primary('pk', 'sk').build();

export const aTableToPutNotesIn = Story.make({
  title: 'A table to put notes in',
  description:
    'Step one of four: a name and two key attributes, which is a complete table.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The notebook needs somewhere to keep notes. What is the least it has to declare?',
      {
        answer:
          'A name and two key attributes — one to say which group a row belongs to, one to order it inside that group. Nothing else is required, and no field of a Note is named yet.',
        proof: Effect.gen(function* () {
          yield* Story.assert(
            'the table knows what it is called',
            table.logicalName === 'notebook',
          );
          yield* Story.assert(
            'it has a partition key and a sort key',
            table.primary.pk === 'pk' && table.primary.sk === 'sk',
          );
          yield* Story.assert(
            'and nothing else',
            Object.keys(table.localSecondaryIndexes).length === 0 &&
              Object.keys(table.globalSecondaryIndexes).length === 0,
          );
          return {
            name: table.logicalName,
            pk: table.primary.pk,
            sk: table.primary.sk,
          };
        }),
      },
    ),
    Story.question(
      'Why are the two attributes called `pk` and `sk` and not `notebook` and `noteId`?',
      {
        answer:
          'Because the table does not know about notes. It holds rows addressed by two strings; which fields of which entity produce those strings is the next step.',
        proof: Effect.gen(function* () {
          yield* Story.assert(
            'the table names attributes, not fields',
            typeof table.primary.pk === 'string' &&
              typeof table.primary.sk === 'string',
          );
          return { primary: table.primary };
        }),
      },
    ),
  ],
});
