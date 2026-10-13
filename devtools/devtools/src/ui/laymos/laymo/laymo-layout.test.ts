import { describe, expect, it } from 'vitest';

import { studioAnalysis } from './fixtures/studio-analysis';
import { rankEdgesOf } from './laymo-edges';
import { deepestOpen, layoutLaymo } from './laymo-layout';
import { buildLaymoTree } from './laymo-tree';

const tree = buildLaymoTree(studioAnalysis.tree);
const spacing = { rank: 40, row: 10, column: 10, inset: 10, headGap: 0 };
const sizeOf = (_node: unknown, open: boolean) =>
  open ? { width: 200, height: 40 } : { width: 100, height: 50 };
const lay = (...open: string[]) =>
  layoutLaymo(
    tree,
    new Set(open),
    sizeOf,
    (node) => rankEdgesOf(node, studioAnalysis),
    spacing,
  );

describe('layoutLaymo', () => {
  it('shows only the Project card when nothing is open', () => {
    const map = lay();
    expect(map.cards.map((card) => card.key)).toEqual(['.']);
    expect(map.bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('grows the Project card around its ranked children', () => {
    const map = lay('.');
    const root = map.byKey.get('.')!;
    expect(root.open).toBe(true);
    expect(root.children).toEqual(['apps', 'scripts', 'tools/lint', 'src']);
    const apps = map.byKey.get('apps')!;
    const src = map.byKey.get('src')!;
    // apps -> src ranks src below apps.
    expect(src.y).toBeGreaterThan(apps.y + apps.height);
    expect(src.x).toBeGreaterThanOrEqual(root.x + spacing.inset);
    expect(root.height).toBe(
      root.headHeight +
        (src.y + src.height - (root.y + root.headHeight)) +
        spacing.inset,
    );
  });

  it('nests an open child inside its parent and keeps the others closed', () => {
    const map = lay('.', 'src');
    const src = map.byKey.get('src')!;
    const app = map.byKey.get('src/app')!;
    expect(app.parentKey).toBe('src');
    expect(app.depth).toBe(2);
    expect(app.x).toBeGreaterThanOrEqual(src.x);
    expect(app.x + app.width).toBeLessThanOrEqual(src.x + src.width);
    expect(app.y).toBeGreaterThanOrEqual(src.y + src.headHeight);
    expect(map.byKey.has('src/domain/orders')).toBe(false);
    expect(map.byKey.get('apps')!.open).toBe(false);
  });

  it('treats an open leaf as a card of its open size with no children', () => {
    const map = lay('.', 'apps', 'apps/web');
    const web = map.byKey.get('apps/web')!;
    expect(web.open).toBe(true);
    expect(web.children).toEqual([]);
    expect(web.width).toBe(200);
  });

  it('names the deepest open card holding children', () => {
    expect(deepestOpen(lay('.', 'src', 'src/domain'))!.key).toBe('src/domain');
    expect(deepestOpen(lay('.', 'apps', 'apps/web'))!.key).toBe('apps');
  });
});
