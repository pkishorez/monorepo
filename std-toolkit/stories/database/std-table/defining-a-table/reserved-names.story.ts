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

const reservedAttributes = ['_e', '_v', '_u', '_d', 'data'];

export const reservedNames = Story.make({
  title: 'Reserved names',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which attribute names can a table not use?', {
      answer:
        'The five names the portable row layout owns — `_e`, `_v`, `_u`, `_d` and `data` — are rejected wherever a key attribute is declared.',
      proof: Effect.gen(function* () {
        const messages = yield* Effect.sync(() =>
          reservedAttributes.map((name) =>
            attempt(() =>
              StdTable.make('reserved').primary(name, 'sk').build(),
            ),
          ),
        );
        yield* Story.assert(
          'every reserved attribute is refused',
          messages.every((message) =>
            message.includes('is reserved for portable storage'),
          ),
        );
        return { example: messages[0], refused: reservedAttributes };
      }),
    }),
    Story.question('Which index slot names are reserved?', {
      answer:
        'The slot name `_entity` is reserved, so neither an LSI nor a GSI can claim it.',
      proof: Effect.gen(function* () {
        const messages = yield* Effect.sync(() => ({
          lsi: attempt(() =>
            StdTable.make('reserved')
              .primary('pk', 'sk')
              .lsi('_entity', 'LSI1SK')
              .build(),
          ),
          gsi: attempt(() =>
            StdTable.make('reserved')
              .primary('pk', 'sk')
              .gsi('_entity', 'GSI1PK', 'GSI1SK')
              .build(),
          ),
        }));
        yield* Story.assert(
          'the _entity slot name is refused for both index kinds',
          messages.lsi.includes('is reserved') &&
            messages.gsi.includes('is reserved'),
        );
        return messages;
      }),
    }),
  ],
});
