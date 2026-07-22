import { describe, expect, it } from 'vitest';

import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  module,
  rules,
} from '../src/index.js';

describe('config', () => {
  it('normalizes project-relative plain paths', () => {
    const app = layer('app', ['./src//app/']);
    const appModule = module('./src/app/feature/../billing/');
    const config = defineConfig({
      sourceRoots: ['src', 'generated', 'cache'],
      graphs: [
        layerGraph('application', [edge(app, layer('core', ['src/core']))]),
      ],
      modules: [appModule],
      ignore: ['./generated/', 'tmp/../cache'],
    });

    expect(app.paths).toEqual(['src/app']);
    expect(appModule.path).toBe('src/app/billing');
    expect(config.sourceRoots).toEqual(['src', 'generated', 'cache']);
    expect(config.ignore).toEqual(['generated', 'cache']);
  });

  it('requires non-overlapping source roots containing every configured path', () => {
    const app = layer('app', ['src/app']);
    const graph = layerGraph('application', [
      edge(app, layer('core', ['src/core'])),
    ]);

    expect(() => defineConfig({ sourceRoots: [], graphs: [graph] })).toThrow(
      'At least one source root is required',
    );
    expect(() =>
      defineConfig({ sourceRoots: ['src', 'src/app'], graphs: [graph] }),
    ).toThrow('overlap');
    expect(() =>
      defineConfig({ sourceRoots: ['other'], graphs: [graph] }),
    ).toThrow('Layer path "src/app" is not inside any source root');
  });

  it.each(['/src', '../src', 'src/**'])('rejects invalid path %s', (path) => {
    expect(() => layer('app', [path])).toThrow();
  });

  it('requires rules to reuse explicitly declared modules', () => {
    const app = layer('app', ['src']);
    const declared = module('src/declared');
    const missing = module('src/missing');

    expect(() =>
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [
          layerGraph('application', [edge(app, layer('sink', ['sink']))]),
        ],
        modules: [declared],
        moduleRules: [rules(declared, { canImport: [missing] })],
      }),
    ).toThrow(/must reuse module "src\/missing" from config\.modules/);
  });

  it('allows a non-sink layer to connect multiple graphs', () => {
    const feature = layer('feature', ['src/feature']);
    const core = layer('core', ['src/core']);
    const foundation = layer('foundation', ['src/foundation']);

    expect(() =>
      defineConfig({
        sourceRoots: ['src'],
        graphs: [
          layerGraph('feature', [edge(feature, core)]),
          layerGraph('core', [edge(core, foundation)]),
        ],
      }),
    ).not.toThrow();
  });

  it('rejects multiple rule declarations for one module', () => {
    const app = layer('app', ['src']);
    const feature = module('src/feature');

    expect(() =>
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [
          layerGraph('application', [edge(app, layer('sink', ['sink']))]),
        ],
        modules: [feature],
        moduleRules: [
          rules(feature, { canImport: [] }),
          rules(feature, { canImportedBy: [] }),
        ],
      }),
    ).toThrow(/more than one rules declaration/);
  });
});
