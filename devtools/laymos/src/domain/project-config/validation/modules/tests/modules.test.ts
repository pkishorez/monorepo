import { describe, expect, test } from 'vitest';

import type { Config } from '../../../../../architecture-analysis-schema/index.js';
import { validateLoadedConfig } from '../../../project-config.js';
import { validateModules } from '../index.js';

type LayerInput = {
  readonly paths: readonly string[];
  readonly modules?: Config['layers'][string]['modules'];
  readonly moduleGraphs?: Config['layers'][string]['moduleGraphs'];
};

function makeConfig(
  layers: Readonly<Record<string, LayerInput>>,
  ignoredPaths: readonly string[] = [],
): Config {
  return {
    sourceRoots: ['src'],
    ignoredPaths,
    layers: Object.fromEntries(
      Object.entries(layers).map(([id, layer]) => [
        id,
        {
          paths: layer.paths,
          modules: layer.modules ?? {},
          moduleGraphs: layer.moduleGraphs ?? {},
        },
      ]),
    ),
    layerGraphs: {},
  } as Config;
}

function messages(
  layers: Readonly<Record<string, LayerInput>>,
  ignoredPaths: readonly string[] = [],
): readonly string[] {
  return validateModules(makeConfig(layers, ignoredPaths)).map(
    ({ message }) => message,
  );
}

describe('validateModules', () => {
  test('accepts canonical disjoint Modules within one Layer', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          modules: {
            'src/a': { shared: false, exposed: true },
            'src/b': { shared: true, exposed: false },
          },
        },
      }),
    ).toEqual([]);
  });

  test('rejects a non-canonical Module key', () => {
    expect(
      messages({
        app: { paths: ['src'], modules: { './src/a': {} as never } },
      }),
    ).toEqual([
      'layers.app.modules key must be a canonical project-relative file or directory: "./src/a"',
    ]);
  });

  test('rejects overlapping Module roots', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          modules: {
            'src/a': { shared: false, exposed: true },
            'src/a/b': { shared: false, exposed: true },
          },
        },
      }),
    ).toEqual(['Module roots overlap: src/a and src/a/b']);
  });

  test('rejects a Module outside the scopes of its declaring Layer', () => {
    expect(
      messages({
        app: {
          paths: ['src/app'],
          modules: { 'src/domain': { shared: false, exposed: true } },
        },
      }),
    ).toEqual([
      'Module src/domain is not contained by a scope of its Layer app',
    ]);
  });

  test('rejects a Module declared in one Layer but falling inside another', () => {
    expect(
      messages({
        app: {
          paths: ['src/app', 'src/domain'],
          modules: { 'src/domain': { shared: false, exposed: true } },
        },
        domain: { paths: ['src/domain'] },
      }),
    ).toEqual([
      'Module src/domain is declared in Layer app but falls inside Layer domain',
    ]);
  });

  test('rejects a wholly ignored Module', () => {
    expect(
      messages(
        {
          app: {
            paths: ['src'],
            modules: { 'src/a': { shared: false, exposed: true } },
          },
        },
        ['src/a'],
      ),
    ).toEqual(['Module src/a is wholly ignored']);
  });
});

describe('validateModules with Module Graphs', () => {
  const graph = (
    overrides: Partial<Config['layers'][string]['moduleGraphs'][string]> = {},
  ) => ({
    path: 'src/feature',
    modules: {
      'index.ts': { shared: false, exposed: true },
      core: { shared: false, exposed: false },
    },
    rules: { 'index.ts': ['core'] },
    ...overrides,
  });

  test('accepts a well-formed Module Graph', () => {
    expect(
      messages({
        app: { paths: ['src'], moduleGraphs: { feature: graph() } },
      }),
    ).toEqual([]);
  });

  test('rejects a member that is Shared', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          moduleGraphs: {
            feature: graph({
              modules: {
                'index.ts': { shared: false, exposed: true },
                core: { shared: true, exposed: false },
              },
            }),
          },
        },
      }),
    ).toEqual([
      'Module Graph feature member core cannot be Shared. Sharing is Layer-wide, so declare it outside the Graph instead.',
    ]);
  });

  test('rejects a Module Graph that exposes nothing', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          moduleGraphs: {
            feature: graph({
              modules: {
                'index.ts': { shared: false, exposed: false },
                core: { shared: false, exposed: false },
              },
            }),
          },
        },
      }),
    ).toEqual(['Module Graph feature must expose at least one member']);
  });

  test('rejects Rules that name an unknown member', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          moduleGraphs: {
            feature: graph({ rules: { 'index.ts': ['ghost'], missing: [] } }),
          },
        },
      }),
    ).toEqual([
      'Module Graph feature rules reference unknown member ghost',
      'Module Graph feature rules reference unknown member missing',
    ]);
  });

  test('rejects a cycle among Module Graph Rules', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          moduleGraphs: {
            feature: graph({
              rules: { 'index.ts': ['core'], core: ['index.ts'] },
            }),
          },
        },
      }),
    ).toEqual(['Module Graph feature rule cycle includes: core, index.ts']);
  });

  test('rejects a self-referencing Rule', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          moduleGraphs: { feature: graph({ rules: { core: ['core'] } }) },
        },
      }),
    ).toEqual(['Module Graph feature rule cycle includes: core']);
  });

  test('rejects the same Module Graph id in two Layers', () => {
    expect(
      messages({
        app: { paths: ['src/feature'], moduleGraphs: { feature: graph() } },
        other: {
          paths: ['src/other'],
          moduleGraphs: { feature: graph({ path: 'src/other' }) },
        },
      }),
    ).toEqual([
      'Module Graph id feature is declared in more than one Layer: app, other',
    ]);
  });

  test('rejects a free-form Module overlapping a Module Graph', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          modules: { 'src/feature/extra': { shared: false, exposed: true } },
          moduleGraphs: { feature: graph() },
        },
      }),
    ).toEqual(['Module src/feature/extra overlaps Module Graph feature']);
  });

  test('rejects two Module Graphs rooted at overlapping paths', () => {
    expect(
      messages({
        app: {
          paths: ['src'],
          moduleGraphs: {
            feature: graph(),
            inner: graph({ path: 'src/feature/core' }),
          },
        },
      }),
    ).toContain('Module Graph roots overlap: feature and inner');
  });
});

describe('validateLoadedConfig', () => {
  test('rejects a Module absent from the analysis universe', () => {
    const config = makeConfig({
      app: {
        paths: ['src'],
        modules: {
          'src/a': { shared: false, exposed: true },
          'src/ghost': { shared: false, exposed: true },
        },
      },
    });

    expect(
      validateLoadedConfig(config, ['src/a/index.ts']).map(
        ({ message }) => message,
      ),
    ).toEqual(['Module src/ghost does not exist in the analysis universe']);
  });

  test('rejects a Module Graph absent from the analysis universe', () => {
    const config = makeConfig({
      app: {
        paths: ['src'],
        moduleGraphs: {
          feature: {
            path: 'src/feature',
            modules: {
              'index.ts': { shared: false, exposed: true },
              core: { shared: false, exposed: false },
            },
            rules: {},
          },
        },
      },
    });

    expect(validateLoadedConfig(config, ['src/other.ts']).length).toBe(3);
  });
});
