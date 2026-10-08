import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';

const refusal = (define: () => unknown) =>
  Effect.sync(() => {
    try {
      define();
      return 'accepted';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

export default Proof.make({
  title:
    'A table shape that DynamoDB could not hold is refused when it is defined',
  description:
    'Every StdTable keeps to the DynamoDB baseline so any adapter can realize it. The refusal is a thrown error at definition time, before any data exists.',
  prepare: Effect.gen(function* () {
    const fine = yield* refusal(() =>
      StdTable.make('board')
        .primary('pk', 'sk')
        .lsi('LSI1', 'LSI1SK')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .build(),
    );
    yield* Proof.assert('a well-formed table is accepted', fine === 'accepted');
    return { fine };
  }),
  act: () =>
    Effect.all({
      sameKeyTwice: refusal(() => StdTable.make('board').primary('pk', 'pk')),
      reservedAttribute: refusal(() =>
        StdTable.make('board').primary('_v', 'sk'),
      ),
      reusedAttribute: refusal(() =>
        StdTable.make('board').primary('pk', 'sk').lsi('LSI1', 'sk'),
      ),
      slotDefinedTwice: refusal(() =>
        StdTable.make('board')
          .primary('pk', 'sk')
          .gsi('GSI1', 'a', 'b')
          .gsi('GSI1', 'c', 'd'),
      ),
      sixLsis: refusal(() =>
        StdTable.make('board')
          .primary('pk', 'sk')
          .lsi('L1', 's1')
          .lsi('L2', 's2')
          .lsi('L3', 's3')
          .lsi('L4', 's4')
          .lsi('L5', 's5')
          .lsi('L6', 's6'),
      ),
      emptyName: refusal(() => StdTable.make('').primary('pk', 'sk').build()),
    }),
  verify: (refused) =>
    Effect.gen(function* () {
      for (const [shape, message] of Object.entries(refused)) {
        yield* Proof.assert(`${shape} is refused`, message !== 'accepted');
      }
      yield* Proof.assert(
        'the LSI limit names the limit',
        refused.sixLsis.includes('at most 5 LSI'),
      );
    }),
});
