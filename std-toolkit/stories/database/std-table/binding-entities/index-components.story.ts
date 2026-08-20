import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

const table = StdTable.make('index-components-story')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  priority: Schema.Number,
}).build();

const attempt = (build: () => unknown): string => {
  try {
    build();
    return 'built';
  } catch (error) {
    return (error as Error).message;
  }
};

export const indexComponents = Story.make({
  title: 'Index components',
  description:
    'Key components are built from encoded strings, so not every field can be one.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      "What happens if an index component isn't a string-encoded field?",
      {
        answer:
          'The entity refuses to build — keys are composed from encoded strings, so a number, boolean, object or array field can never be a component.',
        proof: Effect.gen(function* () {
          const messages = yield* Effect.sync(() => ({
            sortComponent: attempt(() =>
              table
                .entity(NoteSchema)
                .primary({ pk: ['notebook'] })
                .index('LSI1', 'byPriority', { sk: ['priority'] as never })
                .build(),
            ),
            partitionComponent: attempt(() =>
              table
                .entity(NoteSchema)
                .primary({ pk: ['priority'] as never })
                .build(),
            ),
          }));
          yield* Story.assert(
            'a number field is refused as an index component',
            messages.sortComponent ===
              'Index component "priority" must encode to a string' &&
              messages.partitionComponent ===
                'Index component "priority" must encode to a string',
          );
          return messages;
        }),
      },
    ),
    Story.question(
      'What happens if two access patterns claim the same index slot, or reuse a pattern name?',
      {
        answer:
          'Both are refused — one entity gets at most one pattern per slot, and every pattern name on it is unique.',
        proof: Effect.gen(function* () {
          const messages = yield* Effect.sync(() => ({
            sameSlot: attempt(() =>
              table
                .entity(NoteSchema)
                .primary({ pk: ['notebook'] })
                .index('LSI1', 'byTitle', { sk: ['title'] })
                .index('LSI1', 'byProject', { sk: ['notebook'] })
                .build(),
            ),
            sameName: attempt(() =>
              table
                .entity(NoteSchema)
                .primary({ pk: ['notebook'] })
                .index('LSI1', 'byTitle', { sk: ['title'] })
                .index('GSI1', 'byTitle', {
                  pk: ['notebook'],
                  sk: ['title'],
                })
                .build(),
            ),
          }));
          yield* Story.assert(
            'a slot cannot be claimed twice by one entity',
            messages.sameSlot ===
              'Index slot "LSI1" is already used by this Entity',
          );
          yield* Story.assert(
            'a pattern name cannot be reused by one entity',
            messages.sameName === 'Access pattern "byTitle" is already defined',
          );
          return messages;
        }),
      },
    ),
  ],
});
