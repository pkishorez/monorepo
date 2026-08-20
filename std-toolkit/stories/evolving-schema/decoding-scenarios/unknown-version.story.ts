import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const Widget = ESchema.make('Widget', {
  name: Schema.String,
}).build();

export const unknownVersion = Story.make({
  title: 'Unknown version',
  description: 'A stamp that names an unknown version is refused.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when `_v` names a version that the schema does not have?',
      {
        answer:
          'The decode fails at once. The error names the version. The system does not guess and does not convert the data.',
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
