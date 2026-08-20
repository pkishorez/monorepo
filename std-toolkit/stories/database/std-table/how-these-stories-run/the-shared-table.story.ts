import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { note, settings, table } from '../../support.js';

export const theSharedTable = Story.make({
  title: 'The shared table',
  description:
    'The one table shape that each Story in this part is written against.',
  setupNote: 'The `table` and the `note` that `support.ts` exports.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which table do these notes go into?', {
      answer:
        'One table. It has a partition key, a sort key, one local secondary index slot, and one global secondary index slot. The shape is the same on each database.',
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
    Story.question('What else is in that table?', {
      answer:
        'The notebook settings. They are a single entity, so there is one settings row and it is always there.',
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
