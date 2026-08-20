import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Widget = ESchema.make('Widget', {
  name: Schema.String,
}).build();

export const unknownVersion = Story.make({
  title: 'Unknown version',
  description:
    'A stamp naming a version that was never declared is refused rather than guessed at.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when `_v` names a version the schema never declared?',
      {
        answer:
          'Decode refuses immediately with `Unknown schema version: v99` — no guessing, no coercion.',
        proof: Effect.gen(function* () {
          const error = yield* Effect.flip(
            Widget.decode({ _v: 'v99', name: 'flux capacitor' }),
          );
          yield* Story.assert(
            'the decode is refused',
            error instanceof ESchemaError,
          );
          yield* Story.assert(
            'the error names the offending version',
            error.message === 'Unknown schema version: v99',
          );
          return error;
        }),
      },
    ),
  ],
});
