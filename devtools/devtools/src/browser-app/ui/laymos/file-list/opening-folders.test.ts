import { describe, expect, it } from 'vitest';

import { dimmedWithFolders, openingFolders, treeOrder } from './file-list';

const files = [
  'src/domain/README.md',
  'src/domain/orders/index.ts',
  'src/domain/orders/pricing/index.ts',
  'src/domain/orders/order.ts',
  'src/domain/shared/money/index.ts',
  'src/domain/shared/money/money.ts',
];
const modules = [
  'src/domain/orders',
  'src/domain/orders/pricing',
  'src/domain/shared/money',
];

describe('openingFolders', () => {
  it('opens a Wrapper down to its Modules and leaves them closed', () => {
    expect(openingFolders(files, 'src/domain', modules).sort()).toEqual([
      'src',
      'src/domain',
      'src/domain/shared',
    ]);
  });

  it('opens a Module holding Modules down to them', () => {
    expect(openingFolders(files, 'src/domain/orders', modules).sort()).toEqual([
      'src',
      'src/domain',
      'src/domain/orders',
    ]);
  });

  it('opens a Module holding none whole', () => {
    const money = files.filter((path) =>
      path.startsWith('src/domain/shared/money/'),
    );
    expect(
      openingFolders(money, 'src/domain/shared/money', modules).sort(),
    ).toEqual([
      'src',
      'src/domain',
      'src/domain/shared',
      'src/domain/shared/money',
    ]);
  });
});

describe('dimmedWithFolders', () => {
  it('dims a folder whose files are all dimmed, and no other', () => {
    const files = [
      'src/a/one.ts',
      'src/a/two.ts',
      'src/b/three.ts',
      'src/b/four.ts',
    ];
    const dimmed = new Set(['src/a/one.ts', 'src/a/two.ts', 'src/b/three.ts']);
    expect(dimmedWithFolders(files, dimmed).sort()).toEqual([
      'src/a',
      'src/a/one.ts',
      'src/a/two.ts',
      'src/b/three.ts',
    ]);
  });
});

describe('treeOrder', () => {
  it('lists folders before files, then by name, as the tree does', () => {
    expect(
      treeOrder([
        'src/b.ts',
        'src/a/z.ts',
        'src/a.ts',
        'src/a/b/c.ts',
        'readme.md',
        'src/file10.ts',
        'src/file2.ts',
      ]),
    ).toEqual([
      'src/a/b/c.ts',
      'src/a/z.ts',
      'src/a.ts',
      'src/b.ts',
      'src/file2.ts',
      'src/file10.ts',
      'readme.md',
    ]);
  });
});
