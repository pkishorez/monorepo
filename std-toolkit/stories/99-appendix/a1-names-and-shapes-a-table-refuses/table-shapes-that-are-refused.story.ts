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

// A table with a given number of same-partition slots and own-partition slots, each on its own attributes.
const withSlots = (lsis: number, gsis: number) => {
  let builder = StdTable.make('limits').primary('pk', 'sk');
  for (let slot = 1; slot <= lsis; slot += 1)
    builder = builder.lsi(`LSI${slot}`, `LSI${slot}SK`) as typeof builder;
  for (let slot = 1; slot <= gsis; slot += 1)
    builder = builder.gsi(
      `GSI${slot}`,
      `GSI${slot}PK`,
      `GSI${slot}SK`,
    ) as typeof builder;
  return builder.build();
};

export const tableShapesThatAreRefused = Story.make({
  title: 'Table shapes that are refused',
  description:
    'A row needs two different key attributes, every index needs attributes of its own, and there is a ceiling on how many slots one table can have.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What if the partition key and the sort key are the same attribute?',
      {
        answer:
          'The table refuses to build. A row is addressed by two values, so it needs two attributes to hold them.',
        proof: Effect.gen(function* () {
          // Declare both keys on one attribute; the declaration is refused.
          const refused = yield* outcome(() =>
            StdTable.make('limits').primary('pk', 'pk').build(),
          );
          yield* Story.assert(
            'one attribute cannot be both keys',
            refused ===
              'Primary partition-key and sort-key attributes must differ',
          );
          return { refused };
        }),
      },
    ),
    Story.question('What if two indexes share an attribute?', {
      answer:
        'Refused as well, whether the attribute is already used by another index or by the primary key. Each index writes its own key values into its own attributes, so no attribute can serve two of them.',
      proof: Effect.gen(function* () {
        // A second own-partition slot reusing the first one's partition attribute.
        const acrossIndexes = yield* outcome(() =>
          StdTable.make('limits')
            .primary('pk', 'sk')
            .gsi('GSI1', 'GSI1PK', 'GSI1SK')
            .gsi('GSI2', 'GSI1PK', 'GSI2SK')
            .build(),
        );
        // A same-partition slot reusing the primary sort attribute.
        const againstPrimary = yield* outcome(() =>
          StdTable.make('limits').primary('pk', 'sk').lsi('LSI1', 'sk').build(),
        );
        yield* Story.assert(
          'an attribute already in use cannot be claimed again',
          acrossIndexes.includes('is already used') &&
            againstPrimary.includes('is already used'),
        );
        return { acrossIndexes, againstPrimary };
      }),
    }),
    Story.question('How many slots can one table have?', {
      answer:
        'Five same-partition slots (`lsi`) and twenty own-partition slots (`gsi`), the ceilings DynamoDB imposes, kept on every database so a table stays portable. The last allowed slot builds; the next one is refused.',
      proof: Effect.gen(function* () {
        // Five same-partition slots build; a sixth is refused.
        const fifthLsi = yield* outcome(() => withSlots(5, 0));
        const sixthLsi = yield* outcome(() => withSlots(6, 0));
        // Twenty own-partition slots build; a twenty-first is refused.
        const twentiethGsi = yield* outcome(() => withSlots(0, 20));
        const twentyFirstGsi = yield* outcome(() => withSlots(0, 21));
        yield* Story.assert(
          'the last allowed slot builds and the next one is refused',
          fifthLsi === 'built' &&
            twentiethGsi === 'built' &&
            sixthLsi === 'A Table can define at most 5 LSI slots' &&
            twentyFirstGsi === 'A Table can define at most 20 GSI slots',
        );
        return { fifthLsi, sixthLsi, twentiethGsi, twentyFirstGsi };
      }),
    }),
  ],
});
