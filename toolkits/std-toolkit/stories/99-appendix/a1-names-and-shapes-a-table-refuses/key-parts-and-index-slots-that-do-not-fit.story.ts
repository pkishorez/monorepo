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

// A task that also carries a number, a flag, and a date.
const ViewedTask = EntityESchema.make('ViewedTask', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  views: Schema.Number,
  pinned: Schema.Boolean,
  dueAt: Schema.DateFromString,
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
    'A key part is a string or a number, and one entity can claim each slot and each pattern name only once.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What can be part of a key?', {
      answer:
        'A string or a number, read from the task by its key path. Numbers are stored so that they still sort as numbers. A boolean, a list, or a converted value such as a `Date` is refused when the entity is attached; to key by a date, keep its string in a field of its own.',
      proof: Effect.gen(function* () {
        // Order by `views` in a same-partition slot; a number is a key part.
        const byViews = yield* outcome(() =>
          table
            .entity(ViewedTask)
            .primary({ pk: ['boardId'] })
            .index('LSI1', 'byViews', { sk: ['views'] })
            .build(),
        );
        // Order by the flag; refused.
        const byPinned = yield* outcome(() =>
          table
            .entity(ViewedTask)
            .primary({ pk: ['boardId'] })
            .index('LSI1', 'byPinned', { sk: ['pinned'] as never })
            .build(),
        );
        // Order by the date; refused, because code holds a Date, not text.
        const byDue = yield* outcome(() =>
          table
            .entity(ViewedTask)
            .primary({ pk: ['boardId'] })
            .index('LSI1', 'byDue', { sk: ['dueAt'] as never })
            .build(),
        );
        yield* Story.assert(
          'a number field is a key part',
          byViews === 'built',
        );
        yield* Story.assert(
          'a boolean and a Date are refused',
          byPinned ===
            'Index component "pinned" ends at a Boolean, not a string or number' &&
            byDue ===
              'Index component "dueAt" ends at a Declaration, not a string or number',
        );
        return { byViews, byPinned, byDue };
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
