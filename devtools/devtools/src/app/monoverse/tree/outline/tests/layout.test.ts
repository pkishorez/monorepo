import { describe, expect, it } from 'vitest';

import { buildTree, visibleRows } from '../../../model/index.js';
import {
  guidesOf,
  packageRowHeight,
  placeRows,
  rowHeight,
  topInset,
} from '../layout.js';

/*
 * Outline's rows, one under the other: a Package's takes two lines, its
 * folder's name over its own name and version, and everything below it
 * moves down by the difference.
 */

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
    // The open folder's guide runs the whole height of what it holds.
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
