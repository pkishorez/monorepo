import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Counter = ESchema.make('Counter', {
  count: Schema.Number,
})
  .evolve('v2', { step: Schema.Number }, (previous) => ({
    ...previous,
    step: 1,
  }))
  .evolve('v3', { label: Schema.String }, (previous) => ({
    ...previous,
    label: 'counter',
  }))
  .build();

export const sequentialVersions = Story.make({
  title: 'Why can I not skip version numbers?',
  description:
    'evolve only accepts the next version literal — the chain v1→v2→v3 is enforced by the types.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

You are on v1 and feel like jumping straight to a nice round \`'v5'\`:

\`\`\`ts
ESchema.make('Counter', { count: Schema.Number })
  .evolve('v5', { step: Schema.Number }, …)
//         ~~~~ type error: not assignable to 'v2'
\`\`\`

## Answer

\`evolve\` is typed with \`NextVersion<TVersion>\` — after \`'v1'\` the **only**
accepted literal is \`'v2'\`. Skipping, repeating, or inventing names
(\`'v2-beta'\`) are all compile errors.

The chain matters because decode *walks* it: a v1 payload is folded through
**every** migration in order to reach the latest shape. A hole in the sequence
would be a payload with no path forward.

One honest caveat: this guarantee is **compile-time only**. Nothing re-checks
the sequence at runtime, so declarations produced by codegen bypass it.
`,
  run: Effect.gen(function* () {
    const migrated = yield* Story.trace(
      'fold a v1 payload through the whole chain',
      Effect.gen(function* () {
        yield* Effect.log('v1 payload enters: { count: 2 }');
        const decoded = yield* Counter.decode({ _v: 'v1', count: 2 });
        yield* Effect.log('v1→v2 added step, v2→v3 added label');
        return decoded;
      }).pipe(Effect.withSpan('fold-v1-to-v3')),
    );
    yield* Story.assert('the v1→v2 step ran', migrated.step === 1);
    yield* Story.assert(
      'the v2→v3 step ran after it',
      migrated.label === 'counter',
    );
    yield* Story.assert(
      'original data survived the walk',
      migrated.count === 2,
    );
    yield* Story.assert(
      'the schema reports the end of the chain',
      Counter.latestVersion === 'v3',
    );
  }),
});
