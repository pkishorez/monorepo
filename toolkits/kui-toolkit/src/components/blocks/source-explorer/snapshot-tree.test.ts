import { describe, expect, test } from 'vitest';

import { buildSnapshotTree } from './snapshot-tree';

describe('buildSnapshotTree', () => {
  test('keeps project-relative paths for the Project root', () => {
    const tree = buildSnapshotTree(
      [{ path: 'src/app/index.ts' }, { path: 'src/domain/model.ts' }],
      ['.'],
    );

    expect(tree.paths).toEqual(['src/app/index.ts', 'src/domain/model.ts']);
  });

  test('shows Directory Module files relative to the Module path', () => {
    const files = [
      { path: 'src/domain/orders/index.ts', content: '' },
      { path: 'src/domain/orders/events/index.ts', content: '' },
    ];

    const tree = buildSnapshotTree(files, ['src/domain/orders']);

    expect(tree.paths).toEqual(['index.ts', 'events/index.ts']);
    expect(tree.sourcePathByTreePath.get('events/index.ts')).toBe(
      'src/domain/orders/events/index.ts',
    );
  });

  test('shows a File Module by its file name', () => {
    const files = [{ path: 'src/domain/model.ts', content: '' }];

    expect(buildSnapshotTree(files, ['src/domain/model.ts']).paths).toEqual([
      'model.ts',
    ]);
  });

  test('keeps full project-relative paths for several roots', () => {
    const files = [
      { path: 'src/domain/orders/index.ts', content: '' },
      { path: 'src/services/billing/index.ts', content: '' },
    ];

    const tree = buildSnapshotTree(files, [
      'src/domain/orders',
      'src/services/billing',
    ]);

    expect(tree.paths).toEqual([
      'src/domain/orders/index.ts',
      'src/services/billing/index.ts',
    ]);
  });
});
