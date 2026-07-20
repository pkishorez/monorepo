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
      graphs: [
        layerGraph('application', [edge(app, layer('core', ['src/core']))]),
      ],
      modules: [appModule],
      ignore: ['./generated/', 'tmp/../cache'],
    });

    expect(app.paths).toEqual(['src/app']);
    expect(appModule.path).toBe('src/app/billing');
    expect(config.ignore).toEqual(['generated', 'cache']);
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
        graphs: [
          layerGraph('application', [edge(app, layer('sink', ['sink']))]),
        ],
        modules: [declared],
        moduleRules: [rules(declared, { canImport: [missing] })],
      }),
    ).toThrow(/must reuse module "src\/missing" from config\.modules/);
  });

  it('rejects multiple rule declarations for one module', () => {
    const app = layer('app', ['src']);
    const feature = module('src/feature');

    expect(() =>
      defineConfig({
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
