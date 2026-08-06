import { describe, expect, test } from 'vitest';

import { buildScopeHierarchy } from './hierarchy';

describe('buildScopeHierarchy', () => {
  test('builds a shared pruned hierarchy for every layer scope', () => {
    expect(
      buildScopeHierarchy([
        {
          id: 'web',
          scopes: [
            { path: 'src/web/routes', fileCount: 4 },
            { path: 'src/web/screens', fileCount: 7 },
          ],
        },
        {
          id: 'domain',
          scopes: [{ path: 'src/domain', fileCount: 9 }],
        },
      ]),
    ).toEqual([
      {
        name: 'src',
        path: 'src',
        children: [
          {
            name: 'domain',
            path: 'src/domain',
            layerId: 'domain',
            fileCount: 9,
            children: [],
          },
          {
            name: 'web',
            path: 'src/web',
            children: [
              {
                name: 'routes',
                path: 'src/web/routes',
                layerId: 'web',
                fileCount: 4,
                children: [],
              },
              {
                name: 'screens',
                path: 'src/web/screens',
                layerId: 'web',
                fileCount: 7,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  test('returns an empty hierarchy without scopes', () => {
    expect(buildScopeHierarchy([])).toEqual([]);
  });
});
