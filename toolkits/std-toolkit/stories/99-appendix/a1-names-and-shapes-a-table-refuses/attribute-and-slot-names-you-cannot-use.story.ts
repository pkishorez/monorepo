import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';

// Runs a table declaration and hands back the reason it was refused, or `built` when it was not.
const outcome = (build: () => unknown) =>
  Effect.try(build).pipe(
    Effect.map(() => 'built'),
    Effect.catch(({ cause }) =>
      Effect.succeed(String((cause as Error).message)),
    ),
  );

// The five attribute names every stored row already uses for its own bookkeeping.
const reservedAttributes = ['_e', '_v', '_u', '_d', 'data'];

export const attributeAndSlotNamesYouCannotUse = Story.make({
  title: 'Attribute and slot names you cannot use',
  description:
    'Five attribute names and one slot name belong to the row layout. A table that asks for them is refused as it is built.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which attribute names can a table not use as a key?', {
      answer:
        '`_e`, `_v`, `_u`, `_d` and `data`: the stored row already uses those for the entity name, the version stamp, the update stamp, the deleted flag and your value. Naming any of them as a key attribute is refused the moment the table is built, wherever the attribute appears.',
      proof: Effect.gen(function* () {
        // Try each reserved name as the partition key; every attempt is refused.
        const asPartitionKey = yield* Effect.forEach(
          reservedAttributes,
          (name) =>
            outcome(() => StdTable.make('refused').primary(name, 'sk').build()),
        );
        // The same name as an index attribute is refused just the same.
        const asIndexKey = yield* outcome(() =>
          StdTable.make('refused')
            .primary('pk', 'sk')
            .lsi('LSI1', 'data')
            .build(),
        );
        yield* Story.assert(
          'every reserved attribute is refused as a primary key',
          asPartitionKey.every((message) =>
            message.includes('is reserved for portable storage'),
          ),
        );
        yield* Story.assert(
          'and as an index key',
          asIndexKey.includes('is reserved for portable storage'),
        );
        return { asPartitionKey, asIndexKey };
      }),
    }),
    Story.question('Which slot names are taken?', {
      answer:
        'One: `_entity`, the slot the table keeps for its own list of every row by entity. Declare an index under that name, of either kind, and the table refuses to build.',
      proof: Effect.gen(function* () {
        // Ask for a same-partition slot called `_entity`.
        const lsi = yield* outcome(() =>
          StdTable.make('refused')
            .primary('pk', 'sk')
            .lsi('_entity', 'LSI1SK')
            .build(),
        );
        // Ask for an own-partition slot called `_entity`.
        const gsi = yield* outcome(() =>
          StdTable.make('refused')
            .primary('pk', 'sk')
            .gsi('_entity', 'GSI1PK', 'GSI1SK')
            .build(),
        );
        yield* Story.assert(
          'the name is refused for both kinds of slot',
          lsi.includes('is reserved') && gsi.includes('is reserved'),
        );
        return { lsi, gsi };
      }),
    }),
  ],
});
