import { Effect } from 'effect';
import { describe } from 'vitest';

import type { FileGraph } from '../src/architecture/extract-dependencies/index.js';
import { resolveProject } from '../src/architecture/resolve-architecture/index.js';
import { defineConfig, edge, layer, layerGraph, module } from '../src/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

describe('Laymos', () => {
  laymosDescribe(
    'Resolve Architecture',
    {
      description:
        'Assigns extracted files to Layers and Modules and computes allowed Layer reachability.',
      documentation: `
# Joining intent to source files

Dependency extraction says which files and imports exist. Architecture
resolution joins those facts to the declarations in configuration.

The most specific matching Layer path owns a file. A covered file may also
belong to one flat Module; a file with no Layer is uncovered, and an ignored
file remains visible without participating in dependency edges. The combined
Layer Graphs are expanded into transitive reachability for rule validation.
`,
    },
    () => {
      laymosTest(
        'Uses the longest Layer prefix to resolve ownership.',
        {
          description:
            'A more specific Layer path wins when broad and narrow boundaries overlap.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const app = layer('app', ['src'], { description: 'Application' });
            const data = layer('data', ['src/data'], { description: 'Data' });
            const config = defineConfig({
              sourceRoots: ['src'],
              graphs: [
                layerGraph('application', [edge(app, data)], {
                  description: 'Application architecture',
                }),
              ],
            });

            const actual = yield* trace(
              resolveProject(config, graph({ 'src/data/model.ts': [] })),
            );

            expect(
              actual.files['src/data/model.ts'],
              'The data file belongs to the more specific Data Layer.',
            ).toEqual({
              kind: 'covered',
              path: 'src/data/model.ts',
              layer: 'data',
            });
            expect(
              trace.getSpanCount({
                name: 'architecture.resolve',
                status: 'success',
              }),
              'The ownership decision is retained as one resolution trace.',
            ).toBe(1);
          }),
      );

      laymosTest(
        'Assigns a covered file to its containing Module.',
        {
          description:
            'Module membership is inferred from the configured flat Module path.',
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
            });

            const actual = yield* trace(
              resolveProject(config, graph({ 'src/account/index.ts': [] })),
            );

            expect(
              actual.files['src/account/index.ts'],
              'The account file exposes both its Layer and Module ownership.',
            ).toEqual({
              kind: 'covered',
              path: 'src/account/index.ts',
              layer: 'app',
              module: 'src/account',
            });
          }),
      );

      laymosTest(
        'Marks files outside every Layer as uncovered.',
        {
          description:
            'Source remains visible when configuration has not assigned architectural ownership.',
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

            const actual = yield* trace(
              resolveProject(config, graph({ 'src/orphan.ts': [] })),
            );

            expect(
              actual.files['src/orphan.ts'],
              'The unclaimed source file remains visible as uncovered.',
            ).toEqual({ kind: 'uncovered', path: 'src/orphan.ts' });
          }),
      );

      laymosTest(
        'Removes every edge into and out of ignored files.',
        {
          description:
            'Ignored files remain auditable without affecting rule evaluation or coverage.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const app = layer('app', ['src'], { description: 'Application' });
            const config = defineConfig({
              sourceRoots: ['src'],
              graphs: [
                layerGraph(
                  'application',
                  [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
                  { description: 'Application architecture' },
                ),
              ],
              ignore: ['src/generated'],
            });

            const actual = yield* trace(
              resolveProject(
                config,
                graph({
                  'src/app.ts': ['src/generated/client.ts'],
                  'src/generated/client.ts': ['src/app.ts'],
                }),
              ),
            );

            expect(
              actual.files['src/generated/client.ts'],
              'The generated client remains visible with ignored ownership.',
            ).toEqual({
              kind: 'ignored',
              path: 'src/generated/client.ts',
            });
            expect(
              actual.fileGraph.files,
              'No visible dependency edge crosses the ignored boundary.',
            ).toEqual({
              'src/app.ts': { path: 'src/app.ts', imports: [] },
              'src/generated/client.ts': {
                path: 'src/generated/client.ts',
                imports: [],
              },
            });
          }),
      );

      laymosTest(
        'Computes transitive reachability across focused Layer Graphs.',
        {
          description:
            'Separate graph views combine into the one permission graph enforced by Laymos.',
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

            const actual = yield* trace(resolveProject(config, graph({})));

            expect(
              actual.reachability.feature,
              'The Feature Layer can reach Core and Foundation through the graph union.',
            ).toEqual(['core', 'foundation']);
            expect(
              actual.reachability.foundation,
              'The Foundation Layer remains a sink in the graph union.',
            ).toEqual([]);
          }),
      );
    },
  );
});

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
