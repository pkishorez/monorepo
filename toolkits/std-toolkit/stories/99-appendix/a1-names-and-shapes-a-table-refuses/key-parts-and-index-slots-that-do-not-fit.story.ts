import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';

// A private table with one slot of each kind, so a refused attachment never touches the shared one.
const table = StdTable.make('refused')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

// A task that also carries a number: how many times it was viewed.
const ViewedTask = EntityESchema.make('ViewedTask', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  views: Schema.Number,
}).build();

// Runs an attachment and hands back the reason it was refused, or `built` when it was not.
const outcome = (build: () => unknown) =>
  Effect.try(build).pipe(
    Effect.map(() => 'built'),
    Effect.catch(({ cause }) =>
      Effect.succeed(String((cause as Error).message)),
    ),
  );

export const keyPartsAndIndexSlotsThatDoNotFit = Story.make({
  title: 'Key parts and index slots that do not fit',
  description:
    'A key is text, so only a text field can be part of one, and one entity can claim each slot and each pattern name only once.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can a number be part of a key?', {
      answer:
        'No. A key part is joined into a string with the other parts, so only a field whose stored form is text can be one; a number, a boolean, a list or an object is refused when the entity is attached. Store the number as text if it must order rows.',
      proof: Effect.gen(function* () {
        // Order by `views` in a same-partition slot; the number is refused as a key part.
        const asSortKey = yield* outcome(() =>
          table
            .entity(ViewedTask)
            .primary({ pk: ['boardId'] })
            .index('LSI1', 'byViews', { sk: ['views'] as never })
            .build(),
        );
        // Group by `views` in the primary key; refused for the same reason.
        const asPartitionKey = yield* outcome(() =>
          table
            .entity(ViewedTask)
            .primary({ pk: ['views'] as never })
            .build(),
        );
        yield* Story.assert(
          'a number field is refused wherever it would become a key part',
          asSortKey === 'Index component "views" must encode to a string' &&
            asPartitionKey ===
              'Index component "views" must encode to a string',
        );
        return { asSortKey, asPartitionKey };
      }),
    }),
    Story.question(
      'Can one entity use the same slot, or the same name, twice?',
      {
        answer:
          'Neither. A slot holds one key per row, so one entity can put only one pattern in it; and a pattern name is how you ask for a query, so it must name exactly one pattern. Both mistakes are refused when the entity is attached.',
        proof: Effect.gen(function* () {
          // Two patterns in the one same-partition slot.
          const sameSlot = yield* outcome(() =>
            table
              .entity(Task)
              .primary({ pk: ['boardId'] })
              .index('LSI1', 'byTitle', { sk: ['title'] })
              .index('LSI1', 'byColour', { sk: ['colour'] })
              .build(),
          );
          // Two patterns called `byTitle`, in different slots.
          const sameName = yield* outcome(() =>
            table
              .entity(Task)
              .primary({ pk: ['boardId'] })
              .index('LSI1', 'byTitle', { sk: ['title'] })
              .index('GSI1', 'byTitle', { pk: ['assignee'], sk: ['title'] })
              .build(),
          );
          yield* Story.assert(
            'a slot cannot be claimed twice by one entity',
            sameSlot === 'Index slot "LSI1" is already used by this Entity',
          );
          yield* Story.assert(
            'a pattern name cannot be used twice by one entity',
            sameName === 'Access pattern "byTitle" is already defined',
          );
          return { sameSlot, sameName };
        }),
      },
    ),
  ],
});
