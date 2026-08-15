import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';

const attempt = (build: () => unknown): string => {
  try {
    build();
    return 'built';
  } catch (error) {
    return (error as Error).message;
  }
};

interface Slots {
  lsi(name: string, sk: string): Slots;
  gsi(name: string, pk: string, sk: string): Slots;
  build(): unknown;
}

const withSlots = (lsis: number, gsis: number): unknown => {
  let builder = StdTable.make('limits').primary('pk', 'sk') as unknown as Slots;
  for (let slot = 1; slot <= lsis; slot += 1)
    builder = builder.lsi(`LSI${slot}`, `LSI${slot}SK`);
  for (let slot = 1; slot <= gsis; slot += 1)
    builder = builder.gsi(`GSI${slot}`, `GSI${slot}PK`, `GSI${slot}SK`);
  return builder.build();
};

export const topologyLimits = Story.make({
  title: 'Topology limits',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens if the partition key and sort key are the same attribute?',
      {
        answer:
          'The table refuses to build — a row needs two distinct key attributes to be addressable.',
        proof: Effect.gen(function* () {
          const message = yield* Effect.sync(() =>
            attempt(() => StdTable.make('limits').primary('pk', 'pk').build()),
          );
          yield* Story.assert(
            'a table cannot key itself on one attribute twice',
            message ===
              'Primary partition-key and sort-key attributes must differ',
          );
          return message;
        }),
      },
    ),
    Story.question('What happens if two indexes reuse the same attribute?', {
      answer:
        'The second index refuses to build — every index slot owns its key attributes outright, including the primary ones.',
      proof: Effect.gen(function* () {
        const messages = yield* Effect.sync(() => ({
          acrossIndexes: attempt(() =>
            StdTable.make('limits')
              .primary('pk', 'sk')
              .gsi('GSI1', 'GSI1PK', 'GSI1SK')
              .gsi('GSI2', 'GSI1PK', 'GSI2SK')
              .build(),
          ),
          againstPrimary: attempt(() =>
            StdTable.make('limits')
              .primary('pk', 'sk')
              .lsi('LSI1', 'sk')
              .build(),
          ),
        }));
        yield* Story.assert(
          'a key attribute already in use cannot be claimed again',
          messages.acrossIndexes.includes('is already used') &&
            messages.againstPrimary.includes('is already used'),
        );
        return messages;
      }),
    }),
    Story.question('How many index slots can one table declare?', {
      answer:
        'Five LSI slots and twenty GSI slots — the DynamoDB-compatible ceiling every adapter honours.',
      proof: Effect.gen(function* () {
        const boundaries = yield* Effect.sync(() => ({
          fifthLsi: attempt(() => withSlots(5, 0)),
          sixthLsi: attempt(() => withSlots(6, 0)),
          twentiethGsi: attempt(() => withSlots(0, 20)),
          twentyFirstGsi: attempt(() => withSlots(0, 21)),
        }));
        yield* Story.assert(
          'the last allowed slot builds and the next one throws',
          boundaries.fifthLsi === 'built' &&
            boundaries.twentiethGsi === 'built' &&
            boundaries.sixthLsi === 'A Table can define at most 5 LSI slots' &&
            boundaries.twentyFirstGsi ===
              'A Table can define at most 20 GSI slots',
        );
        return boundaries;
      }),
    }),
  ],
});
