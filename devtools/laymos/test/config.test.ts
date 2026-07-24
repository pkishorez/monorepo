import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';
import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  markdown,
  module,
  projectNarrative,
  rules,
} from '../src/index.js';
import { validateConfig } from '../src/config/define-config.js';
import type { LaymosConfig } from '../src/config/types.js';

type ConfigScenario =
  | 'normalize paths'
  | 'empty source roots'
  | 'overlapping source roots'
  | 'path outside source roots'
  | 'absolute path'
  | 'parent path'
  | 'glob path'
  | 'undeclared rule module'
  | 'connected graphs'
  | 'duplicate module rules'
  | 'empty descriptions'
  | 'invalid project narrative'
  | 'equivalent project narratives';

laymosDescribe(
  'Configuration',
  {
    description: 'Validates and normalizes the authored Laymos configuration.',
    documentation: `
## Configuration contract

Laymos configuration uses project-relative paths, explicit architecture
descriptions, reusable module declarations, and Markdown Project Narratives.

These cases cover normalization as well as the validation errors authors need
to correct before analysis can run.
`,
  },
  () => {
    const cases: readonly [
      name: string,
      scenario: ConfigScenario,
      expected: string | boolean,
    ][] = [
      [
        'normalizes project-relative paths',
        'normalize paths',
        json({
          layerPaths: ['src/app'],
          modulePath: 'src/app/billing',
          sourceRoots: ['src', 'generated', 'cache'],
          ignore: ['generated', 'cache'],
        }),
      ],
      [
        'requires at least one source root',
        'empty source roots',
        'At least one source root is required',
      ],
      [
        'rejects overlapping source roots',
        'overlapping source roots',
        'Source roots "src" and "src/app" overlap',
      ],
      [
        'requires configured paths inside source roots',
        'path outside source roots',
        'Layer path "src/app" is not inside any source root',
      ],
      ['rejects absolute paths', 'absolute path', true],
      ['rejects parent paths', 'parent path', true],
      ['rejects glob paths', 'glob path', true],
      ['requires rule modules to be declared', 'undeclared rule module', true],
      ['allows a layer to connect multiple graphs', 'connected graphs', ''],
      ['rejects duplicate module rules', 'duplicate module rules', true],
      [
        'reports every empty architecture description',
        'empty descriptions',
        json([
          'Layer Graph "application" description must not be empty',
          'Layer "app" description must not be empty',
          'Layer "sink" description must not be empty',
          'Module "src/feature" description must not be empty',
        ]),
      ],
      [
        'validates Project Narrative metadata and Markdown',
        'invalid project narrative',
        json([
          'Project Narrative name must not be empty',
          'Project Narrative Markdown content must not be empty',
        ]),
      ],
      [
        'serializes inline and imported Project Narratives identically',
        'equivalent project narratives',
        true,
      ],
    ];

    for (const [name, scenario, expected] of cases) {
      laymosTest(name, { description: name }, ({ expect }) => {
        expect(
          evaluateScenario(scenario),
          'returns the expected configuration result',
        ).toEqual(expected);
      });
    }
  },
);

function evaluateScenario(scenario: ConfigScenario): string | boolean {
  if (scenario === 'normalize paths') {
    const app = layer('app', ['./src//app/'], { description: 'App' });
    const appModule = module('./src/app/feature/../billing/', {
      description: 'Billing',
    });
    const config = validateConfig(
      defineConfig({
        sourceRoots: ['src', 'generated', 'cache'],
        graphs: [
          layerGraph(
            'application',
            [edge(app, layer('core', ['src/core'], { description: 'Core' }))],
            { description: 'Application architecture' },
          ),
        ],
        modules: [appModule],
        ignore: ['./generated/', 'tmp/../cache'],
      }),
    ).config;
    return json({
      layerPaths: config.graphs[0]?.layers[0]?.paths,
      modulePath: config.modules?.[0]?.path,
      sourceRoots: config.sourceRoots,
      ignore: config.ignore,
    });
  }

  const app = layer('app', ['src/app'], { description: 'App' });
  const graph = layerGraph(
    'application',
    [edge(app, layer('core', ['src/core'], { description: 'Core' }))],
    { description: 'Application architecture' },
  );
  if (scenario === 'empty source roots') {
    return firstIssue(
      defineConfig({ sourceRoots: [], graphs: [graph] }),
      'At least one source root is required',
    );
  }
  if (scenario === 'overlapping source roots') {
    return firstIssue(
      defineConfig({ sourceRoots: ['src', 'src/app'], graphs: [graph] }),
      'overlap',
    );
  }
  if (scenario === 'path outside source roots') {
    return firstIssue(
      defineConfig({ sourceRoots: ['other'], graphs: [graph] }),
      'not inside any source root',
    );
  }
  if (
    scenario === 'absolute path' ||
    scenario === 'parent path' ||
    scenario === 'glob path'
  ) {
    const path = {
      'absolute path': '/src',
      'parent path': '../src',
      'glob path': 'src/**',
    }[scenario];
    return (
      issues(
        defineConfig({
          sourceRoots: ['.'],
          graphs: [
            layerGraph(
              'application',
              [
                edge(
                  layer('app', [path], { description: 'App' }),
                  layer('sink', ['sink'], { description: 'Sink' }),
                ),
              ],
              { description: 'Application architecture' },
            ),
          ],
        }),
      ).length > 0
    );
  }
  if (scenario === 'undeclared rule module') {
    const declared = module('src/declared', { description: 'Declared' });
    const missing = module('src/missing', { description: 'Missing' });
    return issues(
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [graph],
        modules: [declared],
        moduleRules: [rules(declared, { canImport: [missing] })],
      }),
    ).some((issue) =>
      issue.includes('must reuse module "src/missing" from config.modules'),
    );
  }
  if (scenario === 'connected graphs') {
    const feature = layer('feature', ['src/feature'], {
      description: 'Feature',
    });
    const core = layer('core', ['src/core'], { description: 'Core' });
    const foundation = layer('foundation', ['src/foundation'], {
      description: 'Foundation',
    });
    return issues(
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
    ).join('\n');
  }
  if (scenario === 'duplicate module rules') {
    const feature = module('src/feature', { description: 'Feature' });
    return issues(
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [graph],
        modules: [feature],
        moduleRules: [
          rules(feature, { canImport: [] }),
          rules(feature, { canImportedBy: [] }),
        ],
      }),
    ).some((issue) => issue.includes('more than one rules declaration'));
  }
  if (scenario === 'empty descriptions') {
    const emptyApp = layer('app', ['src'], { description: ' ' });
    const sink = layer('sink', ['sink'], { description: '\n' });
    const feature = module('src/feature', { description: '\t' });
    return json(
      issues(
        defineConfig({
          sourceRoots: ['src', 'sink'],
          graphs: [
            layerGraph('application', [edge(emptyApp, sink)], {
              description: ' ',
            }),
          ],
          modules: [feature],
        }),
      ).filter((issue) => issue.includes('description must not be empty')),
    );
  }

  const narrativeApp = layer('app', ['src'], {
    description: 'Application',
  });
  const sink = layer('sink', ['sink'], { description: 'Sink' });
  const narrativeGraph = layerGraph('application', [edge(narrativeApp, sink)], {
    description: 'Application architecture',
  });
  if (scenario === 'invalid project narrative') {
    return json(
      issues(
        defineConfig({
          sourceRoots: ['src', 'sink'],
          graphs: [narrativeGraph],
          project: projectNarrative(' ', markdown``),
        }),
      ).filter((issue) => issue.includes('Project Narrative')),
    );
  }
  const content = markdown`
# Example
  `;
  const imported = projectNarrative('Example', content);
  const inline = defineConfig({
    sourceRoots: ['src', 'sink'],
    graphs: [narrativeGraph],
    project: projectNarrative('Example', content),
  });
  const fromImport = defineConfig({
    sourceRoots: ['src', 'sink'],
    graphs: [narrativeGraph],
    project: imported,
  });
  return json(inline.project) === json(fromImport.project);
}

function issues(config: LaymosConfig): readonly string[] {
  return validateConfig(config).issues;
}

function firstIssue(config: LaymosConfig, search: string): string {
  return issues(config).find((issue) => issue.includes(search)) ?? '';
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
