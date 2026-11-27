import { describe, expect, it } from 'vitest';

import { buildTree, visibleRows } from '../logic/shared/index.js';
import {
  guidesOf,
  packageRowHeight,
  placeRows,
  rowHeight,
  topInset,
} from '../view/outline/layout.js';
import { selectionAction } from '../view/selection-bar/selection-bar.js';

const tree = buildTree('', [
  { path: 'apps/web', kind: 'package', label: '@acme/web', version: '1.2.0' },
  { path: 'apps/readme.md', kind: 'file' },
]);
const rows = visibleRows(tree, () => true);

describe('placeRows', () => {
  it('gives a Package two lines, and moves the rows below it down', () => {
    expect(rows.map(({ node }) => node.path)).toEqual([
      'apps',
      'apps/web',
      'apps/readme.md',
    ]);
    const place = placeRows(rows);
    expect([0, 1, 2].map(place.top)).toEqual([
      topInset,
      topInset + rowHeight,
      topInset + rowHeight + packageRowHeight,
    ]);
    expect(place.middle(1)).toBe(topInset + rowHeight + packageRowHeight / 2);
    expect(place.bottom).toBe(topInset + 2 * rowHeight + packageRowHeight);
    expect(guidesOf(rows, place, 0)).toMatchObject([
      {
        folder: 'apps',
        top: place.top(1),
        height: rowHeight + packageRowHeight,
      },
    ]);
  });

  it('keeps a Package its version', () => {
    expect(tree.nodes.get('apps/web')).toMatchObject({
      label: '@acme/web',
      version: '1.2.0',
    });
  });
});

describe('the selection bar', () => {
  it('opens a Package or a file', () => {
    expect(selectionAction({ kind: 'package' }, true)).toBe('Open package');
    expect(selectionAction({ kind: 'file' }, false)).toBe('Open file');
  });

  it("views a folder's changes while Changes is on, else browses its files", () => {
    expect(selectionAction({ kind: 'folder' }, true)).toBe('View changes');
    expect(selectionAction({ kind: 'folder' }, false)).toBe('Browse files');
  });
});
