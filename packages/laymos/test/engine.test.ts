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
    const app = layer('app', ['src']);
    const domain = layer('domain', ['src/domain']);
    const data = layer('data', ['src/data']);
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph('application', [edge(app, domain), edge(domain, data)]),
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

  it('reports both denying module rules for one import', () => {
    const layerDef = layer('app', ['src']);
    const consumer = module('src/consumer');
    const provider = module('src/provider');
    const other = module('src/other');
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [
        layerGraph('application', [edge(layerDef, layer('sink', ['sink']))]),
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
    const consumerLayer = layer('consumer', ['src/consumer']);
    const providerLayer = layer('provider', ['src/provider']);
    const consumer = module('src/consumer');
    const provider = module('src/provider');
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [layerGraph('application', [edge(providerLayer, consumerLayer)])],
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
    const consumerLayer = layer('consumer', ['src/consumer']);
    const providerLayer = layer('provider', ['src/provider']);
    const consumer = module('src/consumer');
    const provider = module('src/provider');
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [layerGraph('application', [edge(providerLayer, consumerLayer)])],
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
    const app = layer('app', ['src']);
    const config = defineConfig({
      sourceRoots: ['.'],
      graphs: [layerGraph('application', [edge(app, layer('sink', ['sink']))])],
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
});

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
