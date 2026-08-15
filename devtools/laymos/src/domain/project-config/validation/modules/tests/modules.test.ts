import { describe, expect, test } from 'vitest';

import { type Config, validateLoadedConfig } from '../../../index.js';
import { validateModules } from '../index.js';

function config(overrides: Partial<Config> = {}): Config {
  return {
    sourceRoots: ['src'],
    ignoredPaths: [],
    layers: { app: { paths: ['src'] } },
    modules: { 'src/app': { kind: 'normal', subpaths: [] } },
    layerGraphs: {},
    ...overrides,
  };
}

describe('validateModules', () => {
  test('accepts canonical disjoint Modules within one Layer', () => {
    expect(
      validateModules(
        config({
          modules: {
            'src/app': { kind: 'normal', subpaths: ['public'] },
            'src/shared': { kind: 'shared', subpaths: [] },
          },
        }),
      ),
    ).toEqual([]);
  });

  test('rejects overlapping Module roots', () => {
    const issues = validateModules(
      config({
        modules: {
          'src/app': { kind: 'normal', subpaths: [] },
          'src/app/child': { kind: 'normal', subpaths: [] },
        },
      }),
    );

    expect(issues.map(({ message }) => message)).toContain(
      'Module roots overlap: src/app and src/app/child',
    );
  });

  test('rejects a Layer containing only Shared Modules', () => {
    const issues = validateModules(
      config({
        modules: {
          'src/a': { kind: 'shared', subpaths: [] },
          'src/b': { kind: 'shared', subpaths: [] },
        },
      }),
    );

    expect(issues.map(({ message }) => message)).toContain(
      'Layer app cannot contain only Shared Modules',
    );
  });

  test('rejects Subpaths on Entry Modules', () => {
    const issues = validateModules(
      config({
        modules: {
          'src/app': { kind: 'entry', subpaths: ['public'] },
        },
      }),
    );

    expect(issues.map(({ message }) => message)).toContain(
      'Entry Module src/app cannot expose Subpaths',
    );
  });

  test('rejects Modules outside Layer scopes or wholly ignored', () => {
    const issues = validateModules(
      config({
        ignoredPaths: ['src/generated'],
        modules: {
          outside: { kind: 'normal', subpaths: [] },
          'src/generated/client': { kind: 'normal', subpaths: [] },
        },
      }),
    );

    expect(issues.map(({ message }) => message)).toEqual([
      'Module outside must be contained by exactly one Layer scope',
      'Module src/generated/client is wholly ignored',
    ]);
  });

  test('rejects invalid, duplicate, and wholly ignored Subpaths', () => {
    const pathIssues = validateModules(
      config({
        modules: {
          'src/app': { kind: 'normal', subpaths: ['../outside'] },
        },
      }),
    );
    expect(pathIssues[0]?.kind).toBe('path');

    const semanticIssues = validateModules(
      config({
        ignoredPaths: ['src/app/generated'],
        modules: {
          'src/app': {
            kind: 'normal',
            subpaths: ['public', 'public', 'generated'],
          },
        },
      }),
    );
    expect(semanticIssues.map(({ message }) => message)).toEqual([
      'Module src/app contains duplicate Subpath public',
      'Subpath src/app/generated is wholly ignored',
    ]);
  });

  test('validates Module paths against the analysis universe', () => {
    const loaded = config({
      modules: {
        'src/button.tsx': { kind: 'shared', subpaths: [] },
        'src/dialog.tsx': { kind: 'normal', subpaths: ['public'] },
        'src/missing': { kind: 'normal', subpaths: [] },
      },
    });

    expect(
      validateLoadedConfig(loaded, ['src/button.tsx', 'src/dialog.tsx']),
    ).toEqual([
      {
        kind: 'module',
        message: 'File Module src/dialog.tsx cannot expose Subpaths',
      },
      {
        kind: 'module',
        message: 'Module src/missing does not exist in the analysis universe',
      },
    ]);
  });
});
