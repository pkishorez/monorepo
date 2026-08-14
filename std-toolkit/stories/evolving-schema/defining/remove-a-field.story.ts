import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Account = ESchema.make('Account', {
  email: Schema.String,
  fax: Schema.String,
})
  .evolve('v2', { fax: null }, ({ fax: _fax, ...rest }) => rest)
  .build();

export const removeAField = Story.make({
  title: 'How do I remove a field I no longer want?',
  description:
    'A null in the delta deletes the field; the migration drops the value.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

The \`fax\` field seemed like a good idea in v1:

\`\`\`ts
const Account = ESchema.make('Account', {
  email: Schema.String,
  fax: Schema.String,
}).build();
\`\`\`

## Answer

Setting a field to \`null\` in the delta removes it from the shape. The
migration returns the previous value without it:

\`\`\`ts
.evolve('v2', { fax: null }, ({ fax: _fax, ...rest }) => rest)
\`\`\`

Old rows still *store* their fax numbers — nothing rewrites the database — but
every decode drops the field on the way out, so code at the latest shape never
sees it.
`,
  run: Effect.gen(function* () {
    const migrated = yield* Story.exec(
      'decode a v1 row that still stores a fax number',
      Account.decode({
        _v: 'v1',
        email: 'ada@lovelace.dev',
        fax: '+1-555-0100',
      }),
    );
    yield* Story.assert(
      'the removed field is gone after decode',
      !('fax' in migrated),
    );
    yield* Story.assert(
      'the surviving field is intact',
      migrated.email === 'ada@lovelace.dev',
    );

    const encoded = yield* Story.exec(
      'encode the migrated row back',
      Account.encode(migrated),
    );
    yield* Story.assert('re-encoded rows are stamped v2', encoded._v === 'v2');
    yield* Story.assert(
      're-encoded rows no longer carry the field',
      !('fax' in encoded),
    );
  }),
});
