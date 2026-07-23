import { describe, expect, it } from 'vitest';

import {
  defineConfig,
  edge,
  layer,
  layerGraph,
  markdown,
  module,
  projectMap,
  projectNarrative,
  rules,
  topic,
} from '../src/index.js';

describe('config', () => {
  it('normalizes project-relative plain paths', () => {
    const app = layer('app', ['./src//app/'], { description: 'App' });
    const appModule = module('./src/app/feature/../billing/', {
      description: 'Billing',
    });
    const config = defineConfig({
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
    });

    expect(app.paths).toEqual(['src/app']);
    expect(appModule.path).toBe('src/app/billing');
    expect(config.sourceRoots).toEqual(['src', 'generated', 'cache']);
    expect(config.ignore).toEqual(['generated', 'cache']);
  });

  it('requires non-overlapping source roots containing every configured path', () => {
    const app = layer('app', ['src/app'], { description: 'App' });
    const graph = layerGraph(
      'application',
      [edge(app, layer('core', ['src/core'], { description: 'Core' }))],
      { description: 'Application architecture' },
    );

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
    expect(() => layer('app', [path], { description: 'App' })).toThrow();
  });

  it('requires rules to reuse explicitly declared modules', () => {
    const app = layer('app', ['src'], { description: 'App' });
    const declared = module('src/declared', { description: 'Declared' });
    const missing = module('src/missing', { description: 'Missing' });

    expect(() =>
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [
          layerGraph(
            'application',
            [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
            { description: 'Application architecture' },
          ),
        ],
        modules: [declared],
        moduleRules: [rules(declared, { canImport: [missing] })],
      }),
    ).toThrow(/must reuse module "src\/missing" from config\.modules/);
  });

  it('allows a non-sink layer to connect multiple graphs', () => {
    const feature = layer('feature', ['src/feature'], {
      description: 'Feature',
    });
    const core = layer('core', ['src/core'], { description: 'Core' });
    const foundation = layer('foundation', ['src/foundation'], {
      description: 'Foundation',
    });

    expect(() =>
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
    ).not.toThrow();
  });

  it('rejects multiple rule declarations for one module', () => {
    const app = layer('app', ['src'], { description: 'App' });
    const feature = module('src/feature', { description: 'Feature' });

    expect(() =>
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [
          layerGraph(
            'application',
            [edge(app, layer('sink', ['sink'], { description: 'Sink' }))],
            { description: 'Application architecture' },
          ),
        ],
        modules: [feature],
        moduleRules: [
          rules(feature, { canImport: [] }),
          rules(feature, { canImportedBy: [] }),
        ],
      }),
    ).toThrow(/more than one rules declaration/);
  });

  it('reports every empty architecture description together', () => {
    const app = layer('app', ['src'], { description: ' ' });
    const sink = layer('sink', ['sink'], { description: '\n' });
    const feature = module('src/feature', { description: '\t' });

    let error: unknown;
    try {
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [
          layerGraph('application', [edge(app, sink)], { description: ' ' }),
        ],
        modules: [feature],
      });
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain(
      'Layer Graph "application" description must not be empty',
    );
    expect(message).toContain('Layer "app" description must not be empty');
    expect(message).toContain('Layer "sink" description must not be empty');
    expect(message).toContain(
      'Module "src/feature" description must not be empty',
    );
  });

  it('validates Project Narrative references by declared identity', () => {
    const app = layer('app', ['src'], { description: 'Application' });
    const sink = layer('sink', ['sink'], { description: 'Sink' });
    const graph = layerGraph('application', [edge(app, sink)], {
      description: 'Application architecture',
    });
    const feature = module('src/feature', { description: 'Feature' });
    const recreatedGraph = layerGraph('application', [edge(app, sink)], {
      description: 'Application architecture',
    });
    const recreatedApp = layer('app', ['src'], { description: 'Application' });
    const recreatedFeature = module('src/feature', { description: 'Feature' });

    let error: unknown;
    try {
      defineConfig({
        sourceRoots: ['src', 'sink'],
        graphs: [graph],
        modules: [feature],
        project: projectNarrative('Example', [
          projectMap(
            topic('Core', {
              description: markdown`
Core responsibility
              `,
              references: [recreatedGraph, recreatedApp, recreatedFeature],
            }),
          ),
        ]),
      });
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('must reuse declared layer-graph "application"');
    expect(message).toContain('must reuse declared layer "app"');
    expect(message).toContain('must reuse declared module "src/feature"');
  });

  it('serializes inline and imported Project Narratives identically', () => {
    const app = layer('app', ['src'], { description: 'Application' });
    const sink = layer('sink', ['sink'], { description: 'Sink' });
    const graph = layerGraph('application', [edge(app, sink)], {
      description: 'Application architecture',
    });
    const feature = module('src/feature', { description: 'Feature' });
    const blocks = [
      markdown`
# Example
      `,
      projectMap(
        topic('Core', {
          description: markdown`
Core responsibility
          `,
          references: [graph, app, feature],
        }),
      ),
    ] as const;
    const imported = projectNarrative('Example', blocks);

    const inline = defineConfig({
      sourceRoots: ['src', 'sink'],
      graphs: [graph],
      modules: [feature],
      project: projectNarrative('Example', blocks),
    });
    const fromImport = defineConfig({
      sourceRoots: ['src', 'sink'],
      graphs: [graph],
      modules: [feature],
      project: imported,
    });

    expect(JSON.parse(JSON.stringify(inline.project))).toEqual(
      JSON.parse(JSON.stringify(fromImport.project)),
    );
  });
});
