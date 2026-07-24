import { describe } from 'vitest';

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
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

interface InvalidConfiguration {
  readonly name: string;
  readonly description: string;
  readonly config: () => LaymosConfig;
  readonly issue: string;
}

describe('Laymos', () => {
  laymosDescribe(
    'Define Configuration',
    {
      description:
        'Protects the paths, graphs, layers, modules, rules, and narrative that describe a project.',
      documentation: `
# Laymos configuration

Laymos starts with an authored description of a project's architecture. Source
roots define the analysis boundary, Layer Graphs describe allowed dependency
directions, and Modules add optional local constraints.

Configuration is normalized before it is checked. Every path must remain inside
the project, graph names and Layer definitions must stay unambiguous, the union
of all graphs must remain acyclic, and Modules must be flat and belong to one
Layer. Invalid declarations are returned together so an author can repair the
whole configuration in one pass.
`,
    },
    () => {
      laymosTest(
        'Normalizes every project-relative path.',
        {
          description:
            'Equivalent relative spellings become one stable POSIX path before validation.',
        },
        ({ expect }) => {
          const app = layer('app', ['./src//app/'], {
            description: 'Application',
          });
          const billing = module('./src/app/feature/../billing/', {
            description: 'Billing',
          });

          const actual = validateConfig(
            defineConfig({
              sourceRoots: ['./src/', 'generated', 'cache'],
              graphs: [
                layerGraph(
                  'application',
                  [
                    edge(
                      app,
                      layer('core', ['src/core'], {
                        description: 'Core',
                      }),
                    ),
                  ],
                  { description: 'Application architecture' },
                ),
              ],
              modules: [billing],
              ignore: ['./generated/', 'tmp/../cache'],
            }),
          );

          expect(
            {
              sourceRoots: actual.config.sourceRoots,
              layerPath: actual.config.graphs[0]?.layers[0]?.paths[0],
              modulePath: actual.config.modules?.[0]?.path,
              ignore: actual.config.ignore,
            },
            'All configured paths use their normalized project-relative form.',
          ).toEqual({
            sourceRoots: ['src', 'generated', 'cache'],
            layerPath: 'src/app',
            modulePath: 'src/app/billing',
            ignore: ['generated', 'cache'],
          });
        },
      );

      laymosTest(
        'Allows one Layer value to connect focused graphs.',
        {
          description:
            'Focused graph views may share the same Layer definition while their union remains acyclic.',
        },
        ({ expect }) => {
          const feature = layer('feature', ['src/feature'], {
            description: 'Feature',
          });
          const core = layer('core', ['src/core'], {
            description: 'Core',
          });
          const foundation = layer('foundation', ['src/foundation'], {
            description: 'Foundation',
          });

          const actual = validateConfig(
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
          );

          expect(
            actual.issues,
            'Reusing the same Core Layer across focused graphs is valid.',
          ).toEqual([]);
        },
      );

      laymosTest(
        'Serializes inline and imported Project Narratives identically.',
        {
          description:
            'A Project Narrative has the same public value whether declared beside the config or imported.',
        },
        ({ expect }) => {
          const content = markdown`
# Example project
          `;
          const imported = projectNarrative('Example', content);

          const inline = defineConfig({
            ...baseConfig(),
            project: projectNarrative('Example', content),
          });
          const fromImport = defineConfig({
            ...baseConfig(),
            project: imported,
          });

          expect(
            inline.project,
            'Imported and inline Project Narratives expose the same value.',
          ).toEqual(fromImport.project);
        },
      );

      for (const scenario of invalidConfigurations()) {
        laymosTest(
          scenario.name,
          { description: scenario.description },
          ({ expect }) => {
            const actual = validateConfig(scenario.config());

            expect(
              actual.issues.some((issue) => issue.includes(scenario.issue)),
              `The configuration reports "${scenario.issue}" for this invalid declaration.`,
            ).toBe(true);
          },
        );
      }

      laymosTest(
        'Reports every missing architecture description together.',
        {
          description:
            'Authors receive the complete set of missing graph, Layer, and Module descriptions.',
        },
        ({ expect }) => {
          const app = layer('app', ['src'], { description: ' ' });
          const sink = layer('sink', ['sink'], { description: '\n' });
          const feature = module('src/feature', { description: '\t' });

          const actual = validateConfig(
            defineConfig({
              sourceRoots: ['src', 'sink'],
              graphs: [
                layerGraph('application', [edge(app, sink)], {
                  description: ' ',
                }),
              ],
              modules: [feature],
            }),
          );

          expect(
            actual.issues.filter((issue) =>
              issue.includes('description must not be empty'),
            ),
            'The author can repair every missing architecture description in one pass.',
          ).toEqual([
            'Layer Graph "application" description must not be empty',
            'Layer "app" description must not be empty',
            'Layer "sink" description must not be empty',
            'Module "src/feature" description must not be empty',
          ]);
        },
      );

      laymosTest(
        'Reports every invalid Project Narrative field together.',
        {
          description:
            'Both the narrative name and Markdown body are required reader-facing content.',
        },
        ({ expect }) => {
          const actual = validateConfig(
            defineConfig({
              ...baseConfig(),
              project: projectNarrative(' ', markdown``),
            }),
          );

          expect(
            actual.issues.filter((issue) =>
              issue.includes('Project Narrative'),
            ),
            'The author sees both invalid Project Narrative fields.',
          ).toEqual([
            'Project Narrative name must not be empty',
            'Project Narrative Markdown content must not be empty',
          ]);
        },
      );
    },
  );
});

function baseConfig(): LaymosConfig {
  const app = layer('app', ['src/app'], { description: 'Application' });
  const core = layer('core', ['src/core'], { description: 'Core' });
  return defineConfig({
    sourceRoots: ['src'],
    graphs: [
      layerGraph('application', [edge(app, core)], {
        description: 'Application architecture',
      }),
    ],
  });
}

function invalidConfigurations(): readonly InvalidConfiguration[] {
  return [
    {
      name: 'Requires at least one source root.',
      description: 'An empty analysis universe cannot produce useful coverage.',
      config: () => ({ ...baseConfig(), sourceRoots: [] }),
      issue: 'At least one source root is required',
    },
    {
      name: 'Rejects duplicate source roots.',
      description: 'The same source boundary cannot be declared twice.',
      config: () => ({ ...baseConfig(), sourceRoots: ['src', 'src'] }),
      issue: 'Source root "src" is declared more than once',
    },
    {
      name: 'Rejects overlapping source roots.',
      description: 'Nested roots would make source ownership ambiguous.',
      config: () => ({ ...baseConfig(), sourceRoots: ['src', 'src/app'] }),
      issue: 'Source roots "src" and "src/app" overlap',
    },
    {
      name: 'Requires Layer paths inside a source root.',
      description: 'Layers cannot claim files outside the analysis universe.',
      config: () => ({ ...baseConfig(), sourceRoots: ['other'] }),
      issue: 'Layer path "src/app" is not inside any source root',
    },
    {
      name: 'Requires Module paths inside a source root.',
      description:
        'Modules cannot describe files outside the analysis universe.',
      config: () => ({
        ...baseConfig(),
        modules: [module('other/feature', { description: 'Feature' })],
      }),
      issue: 'Module path "other/feature" is not inside any source root',
    },
    {
      name: 'Requires ignored paths inside a source root.',
      description: 'Ignore declarations are scoped to analyzed source.',
      config: () => ({ ...baseConfig(), ignore: ['generated'] }),
      issue: 'Ignored path "generated" is not inside any source root',
    },
    ...invalidPathConfigurations(),
    {
      name: 'Rejects an empty Layer Graph name.',
      description: 'Every graph needs a stable identity in reports.',
      config: () => {
        const app = layer('app', ['src/app'], { description: 'Application' });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph(' ', [edge(app, core)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'Layer Graph name must not be empty',
    },
    {
      name: 'Rejects duplicate Layer Graph names.',
      description: 'Graph names identify focused views and must be unique.',
      config: () => {
        const config = baseConfig();
        return { ...config, graphs: [config.graphs[0]!, config.graphs[0]!] };
      },
      issue: 'Duplicate graph name "application"',
    },
    {
      name: 'Rejects a Layer Graph self-edge.',
      description:
        'A Layer cannot depend on itself through an explicit graph edge.',
      config: () => {
        const app = layer('app', ['src/app'], { description: 'Application' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(app, app)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'contains self-edge "app -> app"',
    },
    {
      name: 'Rejects duplicate Layer Graph edges.',
      description: 'One permission edge has one declaration.',
      config: () => {
        const app = layer('app', ['src/app'], { description: 'Application' });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(app, core), edge(app, core)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'contains duplicate edge "app -> core"',
    },
    {
      name: 'Rejects cycles formed across focused graphs.',
      description: 'Every graph may be acyclic alone while their union is not.',
      config: () => {
        const app = layer('app', ['src/app'], { description: 'Application' });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('outbound', [edge(app, core)], {
              description: 'Outbound architecture',
            }),
            layerGraph('inbound', [edge(core, app)], {
              description: 'Inbound architecture',
            }),
          ],
        };
      },
      issue: 'Union cycle:',
    },
    {
      name: 'Rejects an empty Layer name.',
      description: 'Layer names are stable report identities.',
      config: () => {
        const unnamed = layer(' ', ['src/app'], { description: 'Application' });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(unnamed, core)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'Layer name must not be empty',
    },
    {
      name: 'Rejects a Layer without paths.',
      description: 'A Layer must own at least one physical boundary.',
      config: () => {
        const app = layer('app', [], { description: 'Application' });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(app, core)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'Layer "app" must have at least 1 path',
    },
    {
      name: 'Rejects duplicate paths within a Layer.',
      description: 'A Layer path has one declaration.',
      config: () => {
        const app = layer('app', ['src/app', 'src/app'], {
          description: 'Application',
        });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(app, core)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'Layer "app" contains duplicate paths',
    },
    {
      name: 'Rejects distinct Layer definitions with the same name.',
      description: 'A Layer name must refer to one reused declaration.',
      config: () => {
        const first = layer('app', ['src/app'], { description: 'Application' });
        const second = layer('app', ['src/other'], { description: 'Other' });
        const core = layer('core', ['src/core'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('first', [edge(first, core)], {
              description: 'First architecture',
            }),
            layerGraph('second', [edge(second, core)], {
              description: 'Second architecture',
            }),
          ],
        };
      },
      issue: 'Layer name "app" has multiple definitions',
    },
    {
      name: 'Rejects one path claimed by different Layers.',
      description: 'Exact Layer path ownership must be unambiguous.',
      config: () => {
        const app = layer('app', ['src/shared'], {
          description: 'Application',
        });
        const core = layer('core', ['src/shared'], { description: 'Core' });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(app, core)], {
              description: 'Application architecture',
            }),
          ],
        };
      },
      issue: 'Path "src/shared" is declared by both layers "app" and "core"',
    },
    {
      name: 'Rejects duplicate ignored paths.',
      description: 'One invisible boundary has one declaration.',
      config: () => ({
        ...baseConfig(),
        ignore: ['src/generated', 'src/generated'],
      }),
      issue: 'Duplicate ignored path "src/generated"',
    },
    ...invalidModuleConfigurations(),
  ];
}

function invalidPathConfigurations(): readonly InvalidConfiguration[] {
  return [
    [
      '/src/app',
      'must be relative to the project root',
      'Rejects an absolute configured path.',
    ],
    [
      'C:\\src\\app',
      'must be relative to the project root',
      'Rejects a Windows absolute configured path.',
    ],
    [
      '../src/app',
      'escapes the project root',
      'Rejects a parent configured path.',
    ],
    [
      'src/**',
      'must be a plain path, not a glob',
      'Rejects a glob configured path.',
    ],
  ].map(([path, issue, name]) => ({
    name: name!,
    description: 'Configured paths must be plain project-relative prefixes.',
    config: () => {
      const invalid = layer('app', [path!], { description: 'Application' });
      const sink = layer('sink', ['sink'], { description: 'Sink' });
      return {
        sourceRoots: ['.'],
        graphs: [
          layerGraph('application', [edge(invalid, sink)], {
            description: 'Application architecture',
          }),
        ],
      };
    },
    issue: issue!,
  }));
}

function invalidModuleConfigurations(): readonly InvalidConfiguration[] {
  return [
    {
      name: 'Rejects duplicate Module declarations.',
      description: 'A Module path has one reusable definition.',
      config: () => {
        const feature = module('src/app/feature', { description: 'Feature' });
        return { ...baseConfig(), modules: [feature, feature] };
      },
      issue: 'Module "src/app/feature" is declared more than once',
    },
    {
      name: 'Rejects nested Modules.',
      description:
        'Modules are flat boundaries and cannot contain one another.',
      config: () => ({
        ...baseConfig(),
        modules: [
          module('src/app/feature', { description: 'Feature' }),
          module('src/app/feature/internal', { description: 'Internal' }),
        ],
      }),
      issue: 'modules must be flat',
    },
    {
      name: 'Requires every Module to belong to a Layer.',
      description: 'Module ownership is inferred from its containing Layer.',
      config: () => ({
        ...baseConfig(),
        sourceRoots: ['src', 'other'],
        modules: [module('other/feature', { description: 'Feature' })],
      }),
      issue: 'Module "other/feature" is not inside any layer',
    },
    {
      name: 'Rejects a Module that would straddle Layers.',
      description:
        'One Module cannot contain a more specific path owned by another Layer.',
      config: () => {
        const app = layer('app', ['src'], { description: 'Application' });
        const core = layer('core', ['src/feature/core'], {
          description: 'Core',
        });
        return {
          sourceRoots: ['src'],
          graphs: [
            layerGraph('application', [edge(app, core)], {
              description: 'Application architecture',
            }),
          ],
          modules: [module('src/feature', { description: 'Feature' })],
        };
      },
      issue: 'the module would straddle layers',
    },
    {
      name: 'Requires Module rules to declare a constraint.',
      description: 'An empty rules declaration communicates no policy.',
      config: () => {
        const feature = module('src/app/feature', { description: 'Feature' });
        return {
          ...baseConfig(),
          modules: [feature],
          moduleRules: [rules(feature, {})],
        };
      },
      issue: 'must declare canImport or canImportedBy',
    },
    {
      name: 'Requires the rules subject to reuse a declared Module.',
      description:
        'Rules attach to the exact Module value in the configuration.',
      config: () => {
        const declared = module('src/app/feature', { description: 'Feature' });
        const duplicate = module('src/app/feature', { description: 'Feature' });
        return {
          ...baseConfig(),
          modules: [declared],
          moduleRules: [rules(duplicate, { canImport: [] })],
        };
      },
      issue: 'must reuse a value declared in config.modules',
    },
    {
      name: 'Requires rule targets to reuse declared Modules.',
      description:
        'Permission targets must refer to known architecture values.',
      config: () => {
        const feature = module('src/app/feature', { description: 'Feature' });
        const missing = module('src/core/missing', { description: 'Missing' });
        return {
          ...baseConfig(),
          modules: [feature],
          moduleRules: [rules(feature, { canImport: [missing] })],
        };
      },
      issue: 'must reuse module "src/core/missing" from config.modules',
    },
    {
      name: 'Rejects duplicate targets within one Module rule.',
      description: 'One target permission has one declaration.',
      config: () => {
        const feature = module('src/app/feature', { description: 'Feature' });
        const core = module('src/core/domain', { description: 'Domain' });
        return {
          ...baseConfig(),
          modules: [feature, core],
          moduleRules: [rules(feature, { canImport: [core, core] })],
        };
      },
      issue: 'references module "src/core/domain" more than once',
    },
    {
      name: 'Rejects duplicate rules for one Module.',
      description: 'A Module has one combined rules declaration.',
      config: () => {
        const feature = module('src/app/feature', { description: 'Feature' });
        return {
          ...baseConfig(),
          modules: [feature],
          moduleRules: [
            rules(feature, { canImport: [] }),
            rules(feature, { canImportedBy: [] }),
          ],
        };
      },
      issue: 'has more than one rules declaration',
    },
  ];
}
