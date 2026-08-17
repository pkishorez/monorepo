import { describe, expect, test } from 'vitest';

import type { FileGraph } from '../../../file-graph/index.js';
import { analyzeLayers } from '../index.js';

const moduleDefinition = {
  layer: 'app',
  shared: false,
  exposed: true,
} as const;

describe('analyzeLayers', () => {
  test('allows same-Layer and transitively permitted imports', () => {
    const graph: FileGraph = new Map([
      ['src/app/helper.ts', []],
      [
        'src/app/main.ts',
        ['src/app/helper.ts', 'src/infrastructure/database.ts'],
      ],
      ['src/domain/model.ts', ['src/infrastructure/database.ts']],
      ['src/infrastructure/database.ts', []],
    ]);

    const analysis = analyzeLayers(
      graph,
      {
        application: { paths: ['src/app'] },
        domain: { paths: ['src/domain'] },
        infrastructure: { paths: ['src/infrastructure'] },
      },
      {
        application: ['domain'],
        domain: ['infrastructure'],
      },
      {
        'src/app': moduleDefinition,
        'src/domain': moduleDefinition,
        'src/infrastructure': moduleDefinition,
      },
    );

    expect(analysis).toMatchObject({
      unassignedFiles: [],
      forbiddenImports: [],
    });
    expect(analysis.membership.get('src/app/main.ts')).toBe('application');
    expect(analysis.allowedDependencies.get('application')).toEqual(
      new Set(['domain', 'infrastructure']),
    );
  });

  test('reports direct sibling imports', () => {
    const graph: FileGraph = new Map([
      ['src/feature-a/index.ts', ['src/feature-b/index.ts']],
      ['src/feature-b/index.ts', []],
    ]);

    expect(
      analyzeLayers(
        graph,
        {
          'feature-a': { paths: ['src/feature-a'] },
          'feature-b': { paths: ['src/feature-b'] },
        },
        {},
        {
          'src/feature-a': moduleDefinition,
          'src/feature-b': moduleDefinition,
        },
      ).forbiddenImports,
    ).toEqual([
      {
        fromFile: 'src/feature-a/index.ts',
        fromLayer: 'feature-a',
        toFile: 'src/feature-b/index.ts',
        toLayer: 'feature-b',
      },
    ]);
  });

  test('reports unassigned files without speculative dependency violations', () => {
    const graph: FileGraph = new Map([
      ['src/app/main.ts', ['src/shared/log.ts']],
      ['src/shared/log.ts', ['src/app/main.ts']],
    ]);

    expect(
      analyzeLayers(
        graph,
        { app: { paths: ['src/app'] } },
        {},
        { 'src/app': moduleDefinition },
      ),
    ).toMatchObject({
      unassignedFiles: ['src/shared/log.ts'],
      forbiddenImports: [],
    });
  });

  test('reports layers without configured modules', () => {
    const graph: FileGraph = new Map([
      ['src/app/main.ts', []],
      ['src/domain/model.ts', []],
    ]);

    expect(
      analyzeLayers(
        graph,
        {
          app: { paths: ['src/app'] },
          domain: { paths: ['src/domain'] },
        },
        {},
        { 'src/app': moduleDefinition },
      ).layersWithoutModules,
    ).toEqual(['domain']);
  });
});
