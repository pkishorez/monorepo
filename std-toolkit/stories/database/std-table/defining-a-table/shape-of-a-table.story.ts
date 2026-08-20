import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';

const minimal = StdTable.make('minimal-table').primary('pk', 'sk').build();

const indexed = StdTable.make('indexed-table')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const shapeOfATable = Story.make({
  title: 'Shape of a table',
  description:
    'The least a table has to declare, and what a secondary index adds to it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What is the least a table has to declare?', {
      answer:
        'A logical name and the two primary key attributes — one partition key and one sort key — is a complete table.',
      proof: Effect.gen(function* () {
        const shape = {
          name: minimal.logicalName,
          pk: minimal.primary.pk,
          sk: minimal.primary.sk,
          lsis: Object.keys(minimal.localSecondaryIndexes).length,
          gsis: Object.keys(minimal.globalSecondaryIndexes).length,
        };
        yield* Story.assert(
          'a name and a primary key pair are enough to build a table',
          shape.name === 'minimal-table' &&
            shape.pk === 'pk' &&
            shape.sk === 'sk',
        );
        yield* Story.assert(
          'secondary indexes are optional',
          shape.lsis === 0 && shape.gsis === 0,
        );
        return shape;
      }),
    }),
    Story.question("What does an LSI declare that a GSI doesn't?", {
      answer:
        'An LSI names only a new sort attribute and reuses the primary partition key, while a GSI names both of its key attributes.',
      proof: Effect.gen(function* () {
        const lsi = indexed.localSecondaryIndexes.LSI1;
        const gsi = indexed.globalSecondaryIndexes.GSI1;
        const slots = {
          primaryPk: indexed.primary.pk,
          lsi: { pk: lsi.pk, sk: lsi.sk },
          gsi: { pk: gsi.pk, sk: gsi.sk },
        };
        yield* Story.assert(
          'the lsi borrows the primary partition key',
          lsi.pk === indexed.primary.pk && lsi.sk === 'LSI1SK',
        );
        yield* Story.assert(
          'the gsi brings its own partition key',
          gsi.pk === 'GSI1PK' && gsi.sk === 'GSI1SK',
        );
        return slots;
      }),
    }),
  ],
});
