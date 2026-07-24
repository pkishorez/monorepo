import { Effect } from 'effect';

import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  module,
  rules,
} from '../src/index.js';
import type { FileGraph } from '../src/architecture/extract-dependencies/index.js';
import { resolveProject } from '../src/architecture/resolve-architecture/index.js';
import { validateRules } from '../src/architecture/validate-rules/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

type EngineScenario =
  | 'longest prefix'
  | 'focused graph reachability'
  | 'two denying rules'
  | 'module and layer restrictions'
  | 'module allowance cannot override layer'
  | 'explicit ignore';

laymosDescribe(
  'Static architecture engine',
  {
    description:
      'Shows how files resolve to layers and modules before rules are evaluated.',
    documentation: `
## Static analysis pipeline

The engine resolves every production file against the configured architecture,
computes graph reachability, and reports every rule that denies an import.

Module permissions never override layer boundaries, and ignored files remain
auditable without contributing edges or coverage.
`,
  },
  () => {
    const cases: readonly [
      name: string,
      scenario: EngineScenario,
      expected: string,
    ][] = [
      [
        'resolves longest prefixes and transitive reachability',
        'longest prefix',
        json({
          resolved: {
            kind: 'covered',
            path: 'src/data/model.ts',
            layer: 'data',
          },
          violations: [
            {
              kind: 'layer',
              from: { layer: 'data', file: 'src/data/model.ts' },
              to: { layer: 'app', file: 'src/app.ts' },
            },
          ],
        }),
      ],
      [
        'evaluates reachability across focused graphs',
        'focused graph reachability',
        json([]),
      ],
      [
        'reports both denying module rules',
        'two denying rules',
        json(['module:canImport', 'module:canImportedBy']),
      ],
      [
        'applies module and layer restrictions together',
        'module and layer restrictions',
        json(['layer', 'module:canImport']),
      ],
      [
        'does not let module permission override a layer boundary',
        'module allowance cannot override layer',
        json(['layer']),
      ],
      [
        'keeps ignored files auditable without edges or coverage',
        'explicit ignore',
        json({
          ignored: {
            kind: 'ignored',
            path: 'src/generated/client.ts',
          },
          imports: [],
          coverage: { totalFiles: 1, coveredFiles: 1 },
        }),
      ],
    ];

    for (const [name, scenario, expected] of cases) {
      laymosTest(name, { description: name }, ({ expect }) => {
        expect(
          evaluateScenario(scenario),
          'returns the expected architecture result',
        ).toBe(expected);
      });
    }
  },
);

function evaluateScenario(scenario: EngineScenario): string {
  if (scenario === 'longest prefix') {
    const app = layer('app', ['src'], { description: 'App' });
    const domain = layer('domain', ['src/domain'], { description: 'Domain' });
    const data = layer('data', ['src/data'], { description: 'Data' });
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph('application', [edge(app, domain), edge(domain, data)], {
          description: 'Application architecture',
        }),
      ],
    });
    const resolved = Effect.runSync(
      resolveProject(
        config,
        graph({
          'src/app.ts': ['src/data/model.ts'],
          'src/data/model.ts': ['src/app.ts'],
        }),
      ),
    );
    const evaluation = Effect.runSync(validateRules(resolved));
    return json({
      resolved: resolved.files['src/data/model.ts'],
      violations: evaluation.violations,
    });
  }
  if (scenario === 'focused graph reachability') {
    const feature = layer('feature', ['src/feature'], {
      description: 'Feature',
    });
    const core = layer('core', ['src/core'], { description: 'Core' });
    const foundation = layer('foundation', ['src/foundation'], {
      description: 'Foundation',
    });
    const resolved = Effect.runSync(
      resolveProject(
        defineConfig({
          sourceRoots: ['src'],
          graphs: [
            layerGraph('feature', [edge(feature, core)], {
              description: 'Feature architecture',
            }),
            layerGraph('core', [edge(core, foundation)], {
              description: 'Core architecture',
            }),
          ],
        }),
        graph({
          'src/feature/index.ts': ['src/foundation/index.ts'],
          'src/foundation/index.ts': [],
        }),
      ),
    );
    return json(Effect.runSync(validateRules(resolved)).violations);
  }

  if (scenario === 'explicit ignore') {
    const app = layer('app', ['src'], { description: 'App' });
    const resolved = Effect.runSync(
      resolveProject(
        defineConfig({
          sourceRoots: ['.'],
          graphs: [
            layerGraph(
              'application',
              [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
              { description: 'Application architecture' },
            ),
          ],
          ignore: ['src/generated'],
        }),
        graph({
          'src/app.ts': ['src/generated/client.ts'],
          'src/generated/client.ts': ['src/app.ts'],
        }),
      ),
    );
    const evaluation = Effect.runSync(validateRules(resolved));
    return json({
      ignored: resolved.files['src/generated/client.ts'],
      imports: resolved.fileGraph.files['src/app.ts']?.imports,
      coverage: {
        totalFiles: evaluation.coverage.layers.totalFiles,
        coveredFiles: evaluation.coverage.layers.coveredFiles,
      },
    });
  }

  const consumerLayer = layer('consumer', ['src/consumer'], {
    description: 'Consumer',
  });
  const providerLayer = layer('provider', ['src/provider'], {
    description: 'Provider',
  });
  const consumer = module('src/consumer', { description: 'Consumer' });
  const provider = module('src/provider', { description: 'Provider' });
  const other = module('src/other', { description: 'Other' });
  const twoDenyingRules = scenario === 'two denying rules';
  const config = defineConfig({
    sourceRoots: ['.'],
    graphs: [
      layerGraph(
        'application',
        twoDenyingRules
          ? [
              edge(
                layer('app', ['src'], { description: 'App' }),
                layer('sink', ['sink'], { description: 'Sink' }),
              ),
            ]
          : [edge(providerLayer, consumerLayer)],
        { description: 'Application architecture' },
      ),
    ],
    modules: [consumer, provider, other],
    moduleRules: twoDenyingRules
      ? [
          rules(consumer, { canImport: [other] }),
          rules(provider, { canImportedBy: [other] }),
        ]
      : [
          rules(consumer, {
            canImport:
              scenario === 'module allowance cannot override layer'
                ? [provider]
                : [],
          }),
        ],
  });
  const resolved = Effect.runSync(
    resolveProject(
      config,
      graph({
        'src/consumer/index.ts': ['src/provider/index.ts'],
        'src/provider/index.ts': [],
      }),
    ),
  );
  const violations = Effect.runSync(validateRules(resolved)).violations;
  return json(
    violations.map((violation) =>
      violation.kind === 'module'
        ? `${violation.kind}:${violation.rule}`
        : violation.kind,
    ),
  );
}

function graph(imports: Record<string, string[]>): FileGraph {
  return {
    files: Object.fromEntries(
      Object.entries(imports).map(([path, dependencies]) => [
        path,
        { path, imports: dependencies },
      ]),
    ),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
