import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Note = ESchema.make('Note', {
  body: Schema.String,
}).build();

export const reservedUnderscore = Story.make({
  title: 'Reserved underscore',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does the runtime add to an encoded row?', {
      answer:
        'The version stamp `_v` — the whole `_` prefix is reserved so your fields can never collide with it.',
      proof: Effect.gen(function* () {
        const encoded = yield* Note.encode({ body: 'hello' });
        yield* Story.assert(
          'the runtime stamped _v on the stored shape',
          encoded._v === 'v1',
        );
        return encoded;
      }),
    }),
    Story.question('Does my code ever see `_v` after decode?', {
      answer:
        'No — decode strips the stamp back off, so it exists only in storage.',
      proof: Effect.gen(function* () {
        const encoded = yield* Note.encode({ body: 'hello' });
        const decoded = yield* Note.decode(encoded);
        yield* Story.assert(
          'decode strips the stamp back off',
          !('_v' in decoded),
        );
        return decoded;
      }),
    }),
  ],
});
