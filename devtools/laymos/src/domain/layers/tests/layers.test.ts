import { describe, expect, test } from 'vitest';

import type { FileGraph } from '../../file-graph/index.js';
import { lintLayers } from '../index.js';

describe('lintLayers', () => {
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

    expect(
      lintLayers(
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
      ),
    ).toEqual({ unassignedFiles: [], forbiddenImports: [] });
  });

  test('reports direct sibling imports', () => {
    const graph: FileGraph = new Map([
      ['src/feature-a/index.ts', ['src/feature-b/index.ts']],
      ['src/feature-b/index.ts', []],
    ]);

    expect(
      lintLayers(
        graph,
        {
          'feature-a': { paths: ['src/feature-a'] },
          'feature-b': { paths: ['src/feature-b'] },
        },
        {},
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

    expect(lintLayers(graph, { app: { paths: ['src/app'] } }, {})).toEqual({
      unassignedFiles: ['src/shared/log.ts'],
      forbiddenImports: [],
    });
  });
});
