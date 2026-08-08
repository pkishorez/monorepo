import type { ModuleSourceSnapshot } from 'laymos';
import { describe, expect, test } from 'vitest';

import { buildSnapshotTree } from './snapshot-tree';

describe('buildSnapshotTree', () => {
  test('shows Directory Module files relative to the Module path', () => {
    const snapshot: ModuleSourceSnapshot = {
      modulePath: 'src/domain/orders',
      files: [
        { path: 'src/domain/orders/index.ts', content: '' },
        { path: 'src/domain/orders/events/index.ts', content: '' },
      ],
    };

    const tree = buildSnapshotTree(snapshot);

    expect(tree.paths).toEqual(['index.ts', 'events/index.ts']);
    expect(tree.sourcePathByTreePath.get('events/index.ts')).toBe(
      'src/domain/orders/events/index.ts',
    );
  });

  test('shows a File Module by its file name', () => {
    const snapshot: ModuleSourceSnapshot = {
      modulePath: 'src/domain/model.ts',
      files: [{ path: 'src/domain/model.ts', content: '' }],
    };

    expect(buildSnapshotTree(snapshot).paths).toEqual(['model.ts']);
  });
});
