# Laymos

Laymos explains a project’s architecture and test results.

## Architecture

Declare Layers, Layer Graphs, Modules, and optional Module rules in
`laymos.config.ts`. Run `laymos lint` to analyze imports and report violations.

```ts
import { defineConfig, edge, layer, layerGraph } from 'laymos';

const app = layer('app', ['src/app'], { description: 'Application' });
const domain = layer('domain', ['src/domain'], { description: 'Domain' });

export default defineConfig({
  sourceRoots: ['src'],
  graphs: [
    layerGraph('application', [edge(app, domain)], {
      description: 'Application dependencies',
    }),
  ],
});
```

## Tests

Vitest owns test discovery, execution, fixtures, retries, timeouts, and result
status. Laymos uses the project’s installed Vitest through its programmatic API
and maps the completed result into a serializable report.

Run the whole Test Project:

```sh
laymos test
```

Pass one optional target to run an existing test file or find Test Cases by a
case-insensitive literal substring of their full name:

```sh
laymos test src/checkout/checkout.test.ts
laymos test "approved order"
```

Full-project runs keep passing cases compact and expand failures. Targeted runs
show descriptions, named assertions, expected and actual values, span trees,
and inclusive span durations. `--verbose` expands every case and adds trace
attributes, events, and captured Effect logs. `--no-color` disables terminal
colors; the `NO_COLOR` environment variable is also supported. Laymos Test
documentation remains report data and is never printed by the CLI.

Ordinary Vitest suites work without Laymos-specific authoring:

```ts
import { expect, test } from 'vitest';

test('adds numbers', () => {
  expect(2 + 3).toBe(5);
});
```

Assertion-heavy tests can keep the same Vitest shape while declaring Laymos
authorship:

Use Vitest directly for ordinary tests and structural suites. Use
`laymosTest` when a test needs conversational documentation and report
evidence:

```ts
import { Effect } from 'effect';
import { laymosTest } from 'laymos/test';

laymosTest(
  'Add numbers',
  {
    description:
      'Shows how addition behaves for the representative values users encounter.',
    documentation: `
## Addition contract

Inputs are finite numbers and the result follows JavaScript number semantics.
`,
  },
  ({ expect }) => {
    expect(add(2, 3), 'adds positive numbers').toBe(5);
    expect(add(-2, 2), 'balances opposite values').toBe(0);
  },
);
```

The second `expect` argument is the assertion name shown in the report. Every
completed Laymos Test needs at least one unique named assertion. Assertion
failures are collected so the report can show every completed check instead of
stopping at the first mismatch.

Handlers may return `void`, a Promise, or an Effect with no remaining
environment. Use the callback's `trace` function to capture one selected
Effect, then inspect the completed spans with ordinary Vitest assertions.
Effect logs emitted during the capture are retained with their current span, or
as unscoped trace logs when no captured span is current:

```ts
laymosTest(
  'Checkout trace',
  {
    description:
      'Shows the work performed while an approved order is checked out.',
  },
  ({ expect, trace }) =>
    Effect.gen(function* () {
      const result = yield* trace(
        Effect.gen(function* () {
          yield* Effect.log('Checking out order');
          return yield* checkout(order);
        }),
      );

      expect(result, 'charges the order').toBe('charged');
      expect(
        trace.getSpanCount({ name: 'payment' }),
        'records one payment span',
      ).toBe(1);
    }),
);
```

Use `laymosDescribe` only when a suite itself needs description or
documentation. Import hooks, ordinary `describe`, mocks, and other utilities
from `vitest`.

## Node API

```ts
import { runTests } from 'laymos/node';

const report = await Effect.runPromise(
  runTests({
    projectDir: process.cwd(),
    files: ['src/example.test.ts'],
    testNamePattern: 'adds',
  }),
);
```

`files` and `testNamePattern` are optional. Test assertion failures are returned
inside the report. Missing or incompatible Vitest installations and startup
failures reject the operation. Collected Test Cases include their one-based
declaration line and column when Vitest can resolve them. Vitest does not
provide an end line for the Case.

## Public entrypoints

| Entrypoint      | Purpose                                       |
| --------------- | --------------------------------------------- |
| `laymos`        | Architecture configuration                    |
| `laymos/node`   | Architecture analysis and Vitest execution    |
| `laymos/report` | Serializable reports and their Effect Schemas |
| `laymos/test`   | Metadata-enriched Vitest authoring helpers    |
