import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema, ESchemaError } from 'std-toolkit/eschema';

const Status = ValueESchema.make('Status', Schema.String)
  .evolve('v2', Schema.Literals(['open', 'closed']), (previous) =>
    previous === 'done' ? 'closed' : 'open',
  )
  .build();

export const envelopeMigrates = Story.make({
  title: 'Does an old envelope migrate forward on decode?',
  description:
    'Yes — the envelope is unwrapped once, dispatched on _v, and folded like any payload.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

An envelope written back when any string was a legal status:

\`\`\`ts
{ _v: 'v1', value: 'done' }
\`\`\`

v2 tightened the type to the literals \`'open' | 'closed'\`.

## Answer

Decode reads the envelope's \`_v\`, decodes \`value\` with **v1's** codec, then
runs the v1→v2 migration — mapping the free-form \`'done'\` onto the new
\`'closed'\` literal. Old envelopes keep working exactly like old struct rows.

One sharp edge: the unwrap happens **once**. A doubly-wrapped envelope —
\`{ _v, value: { _v, value } }\` — is not peeled twice; the inner envelope is
handed to the codec and fails with \`Decode failed\`. Envelopes are a storage
detail, never a value you nest yourself.
`,
  run: Effect.gen(function* () {
    const migrated = yield* Story.exec(
      'decode a v1 envelope under the tightened v2 codec',
      Status.decode({ _v: 'v1', value: 'done' }),
    );
    yield* Story.assert(
      'the old value was mapped into the new literal set',
      migrated === 'closed',
    );

    const doubleWrapped = yield* Story.exec(
      'decode a doubly-wrapped envelope',
      Effect.flip(
        Status.decode({ _v: 'v1', value: { _v: 'v1', value: 'done' } }),
      ),
    );
    yield* Story.assert(
      'only one layer unwraps — nesting envelopes fails',
      doubleWrapped instanceof ESchemaError &&
        doubleWrapped.message === 'Decode failed',
    );
  }),
});
