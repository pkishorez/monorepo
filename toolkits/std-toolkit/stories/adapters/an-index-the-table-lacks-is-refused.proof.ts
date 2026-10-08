import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  tags: Schema.Array(Schema.String),
}).build();

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
    'An index the table does not have is refused when you define the entity',
  description:
    'An access pattern must name a slot the table has, and every key path must end at a string or number.',
  prepare: Effect.gen(function* () {
    const table = StdTable.make('board')
      .primary('pk', 'sk')
      .lsi('LSI1', 'LSI1SK')
      .build();
    const fine = yield* refusal(() =>
      table
        .entity(Task)
        .primary({ pk: ['boardId'] })
        .index('LSI1', 'byTitle', { sk: ['title'] })
        .build(),
    );
    yield* Proof.assert(
      'a placement on existing slots is accepted',
      fine === 'accepted',
    );
    return { fine };
  }),
  act: () =>
    Effect.all({
      missingSlot: refusal(() => {
        const table = StdTable.make('board').primary('pk', 'sk').build();
        // The cast stands in for a placement written against an older table definition.
        return (table.entity(Task).primary({ pk: ['boardId'] }) as any)
          .index('GSI9', 'byTitle', { pk: ['title'] })
          .build();
      }),
      arrayKeyPath: refusal(() => {
        const table = StdTable.make('board').primary('pk', 'sk').build();
        return table
          .entity(Task)
          .primary({ pk: ['tags' as 'boardId'] })
          .build();
      }),
      entityTwice: refusal(() => {
        const table = StdTable.make('board').primary('pk', 'sk').build();
        table
          .entity(Task)
          .primary({ pk: ['boardId'] })
          .build();
        return table
          .entity(Task)
          .primary({ pk: ['boardId'] })
          .build();
      }),
    }),
  verify: (refused) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'an index on a slot the table lacks is refused',
        refused.missingSlot.includes('is not defined'),
      );
      yield* Proof.assert(
        'a key path into an array is refused',
        refused.arrayKeyPath !== 'accepted',
      );
      yield* Proof.assert(
        'the same entity cannot be placed twice',
        refused.entityTwice.includes('already defined'),
      );
    }),
});
