import { describe, expect, it } from 'vitest';

import { shopAnalysis } from './fixtures/shop-analysis';
import { studioAnalysis } from './fixtures/studio-analysis';
import {
  buildLaymoTree,
  cardHolding,
  collapseAt,
  isAncestor,
  openDownTo,
  topPathOf,
} from './laymo-tree';

const studio = buildLaymoTree(studioAnalysis.tree);
const shop = buildLaymoTree(shopAnalysis.tree);

describe('buildLaymoTree', () => {
  it('makes the Project one card holding the top-level nodes', () => {
    expect(studio.root.key).toBe('.');
    expect(studio.root.children.map((card) => card.key)).toEqual([
      'apps',
      'scripts',
      'src',
      'tools/lint',
    ]);
  });

  it('folds a Wrapper chain with one child into one card named by the path', () => {
    const src = studio.byKey.get('src')!;
    const db = src.children.find((card) => card.key === 'src/db/std-table')!;
    expect(db.title).toBe('db/std-table');
    expect(db.chain.map((node) => node.path)).toEqual([
      'src/db',
      'src/db/std-table',
    ]);
    expect(db.children.map((card) => card.title)).toEqual([
      'definition',
      'migrate',
      'query',
    ]);
    expect(studio.byKey.has('src/db')).toBe(false);
  });

  it('never folds the Project card, even over one child', () => {
    const lint = studio.byKey.get('tools/lint')!;
    expect(lint.title).toBe('tools/lint');
    expect(lint.parentKey).toBe('.');
  });

  it('keeps a Module with one Nested Module as its own card', () => {
    const orders = studio.byKey.get('src/domain/orders')!;
    expect(orders.kind).toBe('module');
    expect(orders.children.map((card) => card.key)).toEqual([
      'src/domain/orders/pricing',
    ]);
  });

  it('tells a File Module from a folder Module and a Wrapper', () => {
    expect(shop.byKey.get('src/core/ids.ts')!.kind).toBe('file-module');
    expect(shop.byKey.get('src')!.kind).toBe('module');
    expect(shop.byKey.get('scripts')!.kind).toBe('wrapper');
  });

  it('titles a card by its path under the card above', () => {
    expect(shop.byKey.get('src/app')!.title).toBe('app');
    // `src/core` holds one File Module, so the chain folds into it.
    expect(shop.byKey.get('src/core/ids.ts')!.title).toBe('core/ids.ts');
  });
});

describe('cardHolding', () => {
  it('finds the deepest card holding a path, through a folded chain', () => {
    expect(cardHolding(studio, 'src/db/std-table/query').key).toBe(
      'src/db/std-table/query',
    );
    expect(cardHolding(studio, 'src/db').key).toBe('src/db/std-table');
    expect(topPathOf(studio.byKey.get('src/db/std-table')!)).toBe('src/db');
  });

  it('stops at the first card the walk may not enter', () => {
    const open = new Set(['.', 'src']);
    expect(
      cardHolding(studio, 'src/domain/orders/pricing', (card) =>
        open.has(card.key),
      ).key,
    ).toBe('src/domain');
  });

  it('holds an unknown path in the Project card', () => {
    expect(cardHolding(studio, 'nowhere/else').key).toBe('.');
  });
});

describe('open paths', () => {
  it('opens every card down to one, keeping the others open', () => {
    expect([...openDownTo(studio, 'src/domain/orders')]).toEqual([
      '.',
      'src',
      'src/domain',
      'src/domain/orders',
    ]);
    expect([
      ...openDownTo(studio, 'src/infra', new Set(['.', 'apps'])),
    ]).toEqual(['.', 'apps', 'src', 'src/infra']);
  });

  it('collapses a card and everything open inside it, and nothing else', () => {
    const open = new Set([
      '.',
      'apps',
      'src',
      'src/domain',
      'src/domain/orders',
    ]);
    expect([...collapseAt(studio, 'src/domain', open)]).toEqual([
      '.',
      'apps',
      'src',
    ]);
  });

  it('knows an ancestor from a sibling', () => {
    expect(isAncestor(studio, 'src', 'src/domain/orders')).toBe(true);
    expect(isAncestor(studio, 'src/app', 'src/domain/orders')).toBe(false);
    expect(isAncestor(studio, 'src/domain/orders', 'src')).toBe(false);
  });
});

describe('deleted Modules', () => {
  it('puts a deleted Module back under the deepest card still standing', () => {
    const tree = buildLaymoTree(studioAnalysis.tree, ['src/infra/mail']);
    expect(tree.byKey.get('src/infra/mail')!.deleted).toBe(true);
    expect(tree.byKey.get('src/infra/mail')!.parentKey).toBe('src/infra');
  });

  it('puts back the deleted folders between, so the shape folds', () => {
    const tree = buildLaymoTree(studioAnalysis.tree, [
      'src/old/a/one',
      'src/old/a/two',
    ]);
    const old = tree.byKey.get('src/old/a')!;
    expect(old.deleted).toBe(true);
    expect(old.kind).toBe('wrapper');
    expect(old.children.map((card) => card.key)).toEqual([
      'src/old/a/one',
      'src/old/a/two',
    ]);
  });

  it('marks a standing Wrapper deleted when every child of it was', () => {
    // src/core holds ids.ts, clock.ts and errors: all three deleted.
    const tree = buildLaymoTree(studioAnalysis.tree, []);
    expect(tree.byKey.get('src/core')!.deleted).toBe(false);
    const gone = buildLaymoTree(
      {
        ...studioAnalysis.tree,
        nodes: studioAnalysis.tree.nodes.map((node) =>
          node.path === 'src/core' ? { ...node, children: [] } : node,
        ),
      },
      ['src/core/a', 'src/core/b'],
    );
    expect(gone.byKey.get('src/core')!.deleted).toBe(true);
  });
});
