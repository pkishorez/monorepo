import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { note, settings, table } from '../../support.js';

export const theSharedTable = Story.make({
  title: 'The shared table',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What table do these stories write to?', {
      answer:
        'One logical table with a partition key, a sort key, one local secondary index slot, and one global secondary index slot — the same shape on every backend.',
      proof: Effect.gen(function* () {
        const shape = {
          logicalName: table.logicalName,
          primary: table.primary,
          localSecondaryIndexes: table.localSecondaryIndexes,
          globalSecondaryIndexes: table.globalSecondaryIndexes,
        };
        yield* Story.assert(
          'the table declares one LSI slot and one GSI slot',
          Object.keys(shape.localSecondaryIndexes).length === 1 &&
            Object.keys(shape.globalSecondaryIndexes).length === 1,
        );
        return shape;
      }),
    }),
    Story.question('Which entities share it?', {
      answer:
        'A keyed `Note` with three access patterns and a single `Settings` record — two entity types living in one table.',
      proof: Effect.gen(function* () {
        const bound = {
          keyed: {
            name: note.name,
            primary: note.primary,
            accessPatterns: Object.keys(note.accessPatterns),
          },
          single: { name: settings.name },
        };
        yield* Story.assert(
          'the note is partitioned by notebook and sorted by its id',
          JSON.stringify(bound.keyed.primary) ===
            JSON.stringify({ pk: ['notebook'], sk: ['noteId'] }),
        );
        return bound;
      }),
    }),
  ],
});
