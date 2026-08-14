import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Note = ESchema.make('Note', {
  body: Schema.String,
}).build();

export const reservedUnderscore = Story.make({
  title: 'Why can my fields not start with an underscore?',
  description:
    'The _ namespace belongs to the runtime — _v is where the version stamp lives.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A tempting field name:

\`\`\`ts
ESchema.make('Note', {
  _draft: Schema.Boolean, // ✗ compile error: underscore prefix is reserved
})
\`\`\`

## Answer

Encoded rows carry runtime metadata alongside your data — most importantly the
version stamp \`_v\`. The whole \`_\` prefix is reserved so your fields and the
runtime's can never collide, today or in a future version of the toolkit.

\`\`\`ts
const note = yield* Note.encode({ body: 'hello' });
// { body: 'hello', _v: 'v1' }   ← the runtime's field, not yours
\`\`\`

Decode strips the stamp back off, so your code never sees \`_v\` — it exists
only in storage.
`,
  run: Effect.gen(function* () {
    const encoded = yield* Story.exec(
      'encode a note and inspect what the runtime added',
      Note.encode({ body: 'hello' }),
    );
    yield* Story.assert(
      'the runtime stamped _v on the stored shape',
      encoded._v === 'v1',
    );

    const decoded = yield* Story.exec('decode it back', Note.decode(encoded));
    yield* Story.assert('decode strips the stamp back off', !('_v' in decoded));
  }),
});
