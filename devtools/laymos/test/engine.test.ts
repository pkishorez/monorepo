import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  module,
  rules,
} from '../src/index.js';
import type { FileGraph } from '../src/engine/1-extract/index.js';
import { resolveProject } from '../src/engine/2-resolve/index.js';
import { evaluateRules } from '../src/engine/3-evaluate/index.js';

describe('static engine', () => {
  it('resolves longest prefixes and evaluates transitive layer reachability', () => {
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
    const fileGraph = graph({
      'src/app.ts': ['src/data/model.ts'],
      'src/data/model.ts': ['src/app.ts'],
    });

    const resolved = Effect.runSync(resolveProject(config, fileGraph));
    const evaluation = Effect.runSync(evaluateRules(resolved));

    expect(resolved.files['src/data/model.ts']).toMatchObject({
      kind: 'covered',
      layer: 'data',
    });
    expect(evaluation.violations).toEqual([
      {
        kind: 'layer',
        from: { layer: 'data', file: 'src/data/model.ts' },
        to: { layer: 'app', file: 'src/app.ts' },
      },
    ]);
  });

  it('evaluates reachability across focused graphs', () => {
    const feature = layer('feature', ['src/feature'], {
      description: 'Feature',
    });
    const core = layer('core', ['src/core'], { description: 'Core' });
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
    const fileGraph = graph({
      'src/feature/index.ts': ['src/foundation/index.ts'],
      'src/foundation/index.ts': [],
    });

    const resolved = Effect.runSync(resolveProject(config, fileGraph));

    expect(Effect.runSync(evaluateRules(resolved)).violations).toEqual([]);
  });

  it('reports both denying module rules for one import', () => {
    const layerDef = layer('app', ['src'], { description: 'App' });
    const consumer = module('src/consumer', { description: 'Consumer' });
    const provider = module('src/provider', { description: 'Provider' });
    const other = module('src/other', { description: 'Other' });
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph(
          'application',
          [edge(layerDef, layer('sink', ['sink'], { description: 'Sink' }))],
          { description: 'Application architecture' },
        ),
      ],
      modules: [consumer, provider, other],
      moduleRules: [
        rules(consumer, { canImport: [other] }),
        rules(provider, { canImportedBy: [other] }),
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

    expect(Effect.runSync(evaluateRules(resolved)).violations).toEqual([
      expect.objectContaining({ kind: 'module', rule: 'canImport' }),
      expect.objectContaining({ kind: 'module', rule: 'canImportedBy' }),
    ]);
  });

  it('applies module restrictions across layers alongside layer restrictions', () => {
    const consumerLayer = layer('consumer', ['src/consumer'], {
      description: 'Consumer',
    });
    const providerLayer = layer('provider', ['src/provider'], {
      description: 'Provider',
    });
    const consumer = module('src/consumer', { description: 'Consumer' });
    const provider = module('src/provider', { description: 'Provider' });
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph('application', [edge(providerLayer, consumerLayer)], {
          description: 'Application architecture',
        }),
      ],
      modules: [consumer, provider],
      moduleRules: [rules(consumer, { canImport: [] })],
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

    expect(Effect.runSync(evaluateRules(resolved)).violations).toEqual([
      expect.objectContaining({ kind: 'layer' }),
      expect.objectContaining({ kind: 'module', rule: 'canImport' }),
    ]);
  });

  it('does not let a cross-layer module allowance override the layer graph', () => {
    const consumerLayer = layer('consumer', ['src/consumer'], {
      description: 'Consumer',
    });
    const providerLayer = layer('provider', ['src/provider'], {
      description: 'Provider',
    });
    const consumer = module('src/consumer', { description: 'Consumer' });
    const provider = module('src/provider', { description: 'Provider' });
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph('application', [edge(providerLayer, consumerLayer)], {
          description: 'Application architecture',
        }),
      ],
      modules: [consumer, provider],
      moduleRules: [rules(consumer, { canImport: [provider] })],
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

    expect(Effect.runSync(evaluateRules(resolved)).violations).toEqual([
      expect.objectContaining({ kind: 'layer' }),
    ]);
  });

  it('keeps explicit ignores auditable but removes their edges and coverage', () => {
    const app = layer('app', ['src'], { description: 'App' });
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph(
          'application',
          [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
          { description: 'Application architecture' },
        ),
      ],
      ignore: ['./src/generated'],
    });
    const resolved = Effect.runSync(
      resolveProject(
        config,
        graph({
          'src/app.ts': ['src/generated/client.ts'],
          'src/generated/client.ts': ['src/app.ts'],
        }),
      ),
    );
    const evaluation = Effect.runSync(evaluateRules(resolved));

    expect(resolved.files['src/generated/client.ts']).toEqual({
      kind: 'ignored',
      path: 'src/generated/client.ts',
    });
    expect(resolved.fileGraph.files['src/app.ts']?.imports).toEqual([]);
    expect(evaluation.coverage.layers).toMatchObject({
      totalFiles: 1,
      coveredFiles: 1,
    });
  });

  it('reports Story imports without adding Story files to static coverage', () => {
    const app = layer('app', ['src'], { description: 'App' });
    const account = module('src/account', { description: 'Account' });
    const config = defineConfig({
      sourceRoots: ['src'],
      graphs: [
        layerGraph(
          'application',
          [edge(app, layer('sink', ['src/sink'], { description: 'Sink' }))],
          { description: 'Application architecture' },
        ),
      ],
      modules: [account],
    });
    const fileGraph: FileGraph = {
      files: {
        'src/account/index.ts': {
          path: 'src/account/index.ts',
          imports: [],
        },
      },
      storyImports: [
        {
          from: 'src/account/index.ts',
          to: 'src/account/stories/support.ts',
          module: 'src/account',
        },
      ],
    };

    const resolved = Effect.runSync(resolveProject(config, fileGraph));
    const evaluation = Effect.runSync(evaluateRules(resolved));

    expect(evaluation.violations).toEqual([
      {
        kind: 'story-import',
        from: { file: 'src/account/index.ts' },
        to: {
          module: 'src/account',
          file: 'src/account/stories/support.ts',
        },
      },
    ]);
    expect(evaluation.coverage).toEqual({
      layers: { totalFiles: 1, coveredFiles: 1, uncovered: [] },
      modules: [
        {
          layer: 'app',
          totalFiles: 1,
          coveredFiles: 1,
          uncovered: [],
        },
        {
          layer: 'sink',
          totalFiles: 0,
          coveredFiles: 0,
          uncovered: [],
        },
      ],
    });
  });
});

function graph(imports: Record<string, string[]>): FileGraph {
  return {
    files: Object.fromEntries(
      Object.entries(imports).map(([path, dependencies]) => [
        path,
        { path, imports: dependencies },
      ]),
    ),
    storyImports: [],
  };
}
