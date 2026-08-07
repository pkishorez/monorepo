import { describe, expect, test } from 'vitest';

import type { Config } from '../../../index.js';
import { validateModules } from '../index.js';

function config(overrides: Partial<Config> = {}): Config {
  return {
    sourceRoots: ['src'],
    ignoredPaths: [],
    layers: { app: { paths: ['src'] } },
    modules: { 'src/app': { shared: false, nested: [] } },
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
            'src/app': { shared: false, nested: ['public'] },
            'src/shared': { shared: true, nested: [] },
          },
        }),
      ),
    ).toEqual([]);
  });

  test('rejects overlapping Module roots', () => {
    const issues = validateModules(
      config({
        modules: {
          'src/app': { shared: false, nested: [] },
          'src/app/child': { shared: false, nested: [] },
        },
      }),
    );

    expect(issues.map(({ message }) => message)).toContain(
      'Module roots overlap: src/app and src/app/child',
    );
  });

  test('rejects Modules outside Layer scopes or wholly ignored', () => {
    const issues = validateModules(
      config({
        ignoredPaths: ['src/generated'],
        modules: {
          outside: { shared: false, nested: [] },
          'src/generated/client': { shared: false, nested: [] },
        },
      }),
    );

    expect(issues.map(({ message }) => message)).toEqual([
      'Module outside must be contained by exactly one Layer scope',
      'Module src/generated/client is wholly ignored',
    ]);
  });

  test('rejects invalid, duplicate, and wholly ignored nested paths', () => {
    const pathIssues = validateModules(
      config({
        modules: {
          'src/app': { shared: false, nested: ['../outside'] },
        },
      }),
    );
    expect(pathIssues[0]?.kind).toBe('path');

    const semanticIssues = validateModules(
      config({
        ignoredPaths: ['src/app/generated'],
        modules: {
          'src/app': {
            shared: false,
            nested: ['public', 'public', 'generated'],
          },
        },
      }),
    );
    expect(semanticIssues.map(({ message }) => message)).toEqual([
      'Module src/app contains duplicate nested path public',
      'Nested Module src/app/generated is wholly ignored',
    ]);
  });
});
