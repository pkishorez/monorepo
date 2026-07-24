import { Effect } from 'effect';
import { describe } from 'vitest';

import type { FileGraph } from '../src/architecture/extract-dependencies/index.js';
import { resolveProject } from '../src/architecture/resolve-architecture/index.js';
import { validateRules } from '../src/architecture/validate-rules/index.js';
import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  module,
  rules,
} from '../src/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

describe('Laymos', () => {
  laymosDescribe(
    'Validate Rules',
    {
      description:
        'Reports forbidden Layer and Module imports while measuring visible architecture coverage.',
      documentation: `
# Enforcing the resolved architecture

Rule validation reads resolved file ownership and evaluates each visible import.
Cross-Layer imports require reachability in the combined Layer Graphs. Module
rules are optional restrictions: \`canImport\` disciplines a consumer and
\`canImportedBy\` protects a provider. They can tighten a Layer permission but
can never grant one.

Violations are successful report data rather than runtime failures. Coverage is
also report data: ignored files disappear from its denominator, while uncovered
files and covered files outside Modules remain visible ratchets.
`,
    },
    () => {
      laymosTest(
        'Allows an import reachable through focused Layer Graphs.',
        {
          description:
            'Transitive reachability in the graph union authorizes the dependency.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const feature = layer('feature', ['src/feature'], {
              description: 'Feature',
            });
            const core = layer('core', ['src/core'], {
              description: 'Core',
            });
            const foundation = layer('foundation', ['src/foundation'], {
              description: 'Foundation',
            });
            const config = defineConfig({
              sourceRoots: ['src'],
              graphs: [
                layerGraph('feature', [edge(feature, core)], {
                  description: 'Feature architecture',
                }),
                layerGraph('core', [edge(core, foundation)], {
                  description: 'Core architecture',
                }),
              ],
            });
            const resolved = yield* resolveProject(
              config,
              graph({
                'src/feature/index.ts': ['src/foundation/index.ts'],
                'src/foundation/index.ts': [],
              }),
            );

            const actual = yield* trace(validateRules(resolved));

            expect(
              actual.violations,
              'The transitive Feature-to-Foundation import has no violation.',
            ).toEqual([]);
            expect(
              trace.getSpanCount({
                name: 'architecture.validate',
                status: 'success',
              }),
              'The rule verdict is retained as one validation trace.',
            ).toBe(1);
          }),
      );

      for (const scenario of violationScenarios()) {
        laymosTest(
          scenario.name,
          { description: scenario.description },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const resolved = yield* resolveProject(
                scenario.config,
                scenario.fileGraph,
              );

              const actual = yield* trace(validateRules(resolved));

              expect(
                actual.violations.map((violation) =>
                  violation.kind === 'module'
                    ? `${violation.kind}:${violation.rule}`
                    : violation.kind,
                ),
                scenario.assertion,
              ).toEqual(scenario.expected);
            }),
        );
      }

      laymosTest(
        'Skips rules for imports within the same Module.',
        {
          description:
            'Module rules govern boundaries between Modules, not internal implementation edges.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const app = layer('app', ['src'], { description: 'Application' });
            const account = module('src/account', { description: 'Account' });
            const config = defineConfig({
              sourceRoots: ['src'],
              graphs: [
                layerGraph(
                  'application',
                  [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
                  { description: 'Application architecture' },
                ),
              ],
              modules: [account],
              moduleRules: [rules(account, { canImport: [] })],
            });
            const resolved = yield* resolveProject(
              config,
              graph({
                'src/account/index.ts': ['src/account/model.ts'],
                'src/account/model.ts': [],
              }),
            );

            const actual = yield* trace(validateRules(resolved));

            expect(
              actual.violations,
              'Internal Account imports do not cross the Module boundary.',
            ).toEqual([]);
          }),
      );

      laymosTest(
        'Reports uncovered files in deterministic Layer coverage.',
        {
          description:
            'Visible source without Layer ownership lowers the Layer coverage ratchet.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const app = layer('app', ['src/app'], {
              description: 'Application',
            });
            const config = defineConfig({
              sourceRoots: ['src'],
              graphs: [
                layerGraph(
                  'application',
                  [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
                  { description: 'Application architecture' },
                ),
              ],
            });
            const resolved = yield* resolveProject(
              config,
              graph({
                'src/app/index.ts': [],
                'src/zeta.ts': [],
                'src/alpha.ts': [],
              }),
            );

            const actual = yield* trace(validateRules(resolved));

            expect(
              actual.coverage.layers,
              'Layer coverage counts all visible files and sorts the uncovered paths.',
            ).toEqual({
              totalFiles: 3,
              coveredFiles: 1,
              uncovered: ['src/alpha.ts', 'src/zeta.ts'],
            });
          }),
      );

      laymosTest(
        'Excludes ignored files from every coverage denominator.',
        {
          description:
            'Invisible generated source cannot lower Layer or Module coverage.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const app = layer('app', ['src'], { description: 'Application' });
            const account = module('src/account', { description: 'Account' });
            const config = defineConfig({
              sourceRoots: ['src'],
              graphs: [
                layerGraph(
                  'application',
                  [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
                  { description: 'Application architecture' },
                ),
              ],
              modules: [account],
              ignore: ['src/generated'],
            });
            const resolved = yield* resolveProject(
              config,
              graph({
                'src/account/index.ts': [],
                'src/generated/client.ts': [],
              }),
            );

            const actual = yield* trace(validateRules(resolved));

            expect(
              actual.coverage.layers,
              'Layer coverage counts only the visible Account file.',
            ).toEqual({ totalFiles: 1, coveredFiles: 1, uncovered: [] });
            expect(
              actual.coverage.modules.find(({ layer }) => layer === 'app'),
              'Module coverage counts only the visible Account file.',
            ).toEqual({
              layer: 'app',
              totalFiles: 1,
              coveredFiles: 1,
              uncovered: [],
            });
          }),
      );
    },
  );
});

interface ViolationScenario {
  readonly name: string;
  readonly description: string;
  readonly config: ReturnType<typeof defineConfig>;
  readonly fileGraph: FileGraph;
  readonly expected: readonly string[];
  readonly assertion: string;
}

function violationScenarios(): readonly ViolationScenario[] {
  const consumerLayer = layer('consumer', ['src/consumer'], {
    description: 'Consumer',
  });
  const providerLayer = layer('provider', ['src/provider'], {
    description: 'Provider',
  });
  const consumer = module('src/consumer', { description: 'Consumer' });
  const provider = module('src/provider', { description: 'Provider' });
  const other = module('src/other', { description: 'Other' });
  const files = graph({
    'src/consumer/index.ts': ['src/provider/index.ts'],
    'src/provider/index.ts': [],
  });
  const base = {
    sourceRoots: ['src'],
    graphs: [
      layerGraph('application', [edge(providerLayer, consumerLayer)], {
        description: 'Application architecture',
      }),
    ],
    modules: [consumer, provider, other],
  };

  return [
    {
      name: 'Reports a forbidden Layer import.',
      description:
        'An import against the declared Layer direction is a Layer violation.',
      config: defineConfig(base),
      fileGraph: files,
      expected: ['layer'],
      assertion:
        'The Consumer-to-Provider import is denied by the Layer Graph.',
    },
    {
      name: 'Reports a consumer Module restriction.',
      description:
        'A canImport rule denies a target that is absent from its allow-list.',
      config: defineConfig({
        ...base,
        graphs: [
          layerGraph('application', [edge(consumerLayer, providerLayer)], {
            description: 'Application architecture',
          }),
        ],
        moduleRules: [rules(consumer, { canImport: [] })],
      }),
      fileGraph: files,
      expected: ['module:canImport'],
      assertion:
        'The Consumer Module rule denies importing the Provider Module.',
    },
    {
      name: 'Reports a provider Module restriction.',
      description:
        'A canImportedBy rule denies a consumer that is absent from its allow-list.',
      config: defineConfig({
        ...base,
        graphs: [
          layerGraph('application', [edge(consumerLayer, providerLayer)], {
            description: 'Application architecture',
          }),
        ],
        moduleRules: [rules(provider, { canImportedBy: [] })],
      }),
      fileGraph: files,
      expected: ['module:canImportedBy'],
      assertion:
        'The Provider Module rule denies imports from the Consumer Module.',
    },
    {
      name: 'Reports both denying Module restrictions.',
      description:
        'Consumer and provider policies are evaluated independently for one import.',
      config: defineConfig({
        ...base,
        graphs: [
          layerGraph('application', [edge(consumerLayer, providerLayer)], {
            description: 'Application architecture',
          }),
        ],
        moduleRules: [
          rules(consumer, { canImport: [other] }),
          rules(provider, { canImportedBy: [other] }),
        ],
      }),
      fileGraph: files,
      expected: ['module:canImport', 'module:canImportedBy'],
      assertion:
        'The import records both the consumer and provider Module denials.',
    },
    {
      name: 'Applies Layer and Module restrictions together.',
      description:
        'One import may disagree with both its Layer graph and Module policy.',
      config: defineConfig({
        ...base,
        moduleRules: [rules(consumer, { canImport: [] })],
      }),
      fileGraph: files,
      expected: ['layer', 'module:canImport'],
      assertion:
        'The import records both its Layer and consumer Module violations.',
    },
    {
      name: 'Does not let Module permission override a Layer boundary.',
      description:
        'Module rules only tighten architecture and never grant Layer access.',
      config: defineConfig({
        ...base,
        moduleRules: [rules(consumer, { canImport: [provider] })],
      }),
      fileGraph: files,
      expected: ['layer'],
      assertion:
        'The Layer violation remains even though the Module permits the target.',
    },
  ];
}

function graph(
  imports: Readonly<Record<string, readonly string[]>>,
): FileGraph {
  return {
    files: Object.fromEntries(
      Object.entries(imports).map(([path, dependencies]) => [
        path,
        { path, imports: dependencies },
      ]),
    ),
  };
}
