import { describe, expect, it } from 'vitest';

import { shopAnalysis } from './fixtures/shop-analysis';
import { studioAnalysis } from './fixtures/studio-analysis';
import { laymoLines, rankEdgesOf, ruleEntriesOf } from './laymo-edges';
import { buildLaymoTree } from './laymo-tree';

const studio = buildLaymoTree(studioAnalysis.tree);
const shop = buildLaymoTree(shopAnalysis.tree);

describe('rankEdgesOf', () => {
  it('ranks the children of a card by the Rules between them', () => {
    const src = studio.byKey.get('src')!;
    const edges = rankEdgesOf(src, studioAnalysis);
    expect(edges).toContainEqual(['src/app', 'src/domain']);
    expect(edges).toContainEqual(['src/sync', 'src/db/std-table']);
    // A Rule naming a nested Module still ranks the child holding it.
    expect(edges).toContainEqual(['src/studio-rpc', 'src/db/std-table']);
    // A Rule inside one child ranks nothing at this level.
    expect(edges).not.toContainEqual(['src/domain', 'src/domain']);
  });

  it('puts a Shared Rule target below every sibling', () => {
    const core = studio.byKey.get('src/core')!;
    const edges = rankEdgesOf(core, studioAnalysis);
    expect(edges).toEqual([
      ['src/core/clock.ts', 'src/core/errors'],
      ['src/core/ids.ts', 'src/core/errors'],
    ]);
  });

  it('falls back to observed imports where no Rule holds among the children', () => {
    const root = shop.root;
    // No Rule spans `scripts` and `src`, and no import does either.
    expect(rankEdgesOf(root, shopAnalysis)).toEqual([]);
    const infra = studio.byKey.get('src/infra')!;
    expect(rankEdgesOf(infra, studioAnalysis)).toEqual([]);
  });

  it('ranks by a Violation when nothing is declared', () => {
    const domain = studio.byKey.get('src/domain')!;
    // orders -> customers is a Rule, so Rules decide here...
    expect(rankEdgesOf(domain, studioAnalysis)).toEqual([
      ['src/domain/orders', 'src/domain/customers'],
    ]);
  });
});

describe('laymoLines at rest', () => {
  const rest = (open: readonly string[]) =>
    laymoLines(studio, new Set(open), studioAnalysis, undefined);
  const ids = (open: readonly string[]) =>
    rest(open).edges.map((edge) => edge.id);

  it('draws the imports the code makes, rolled up to the Project level', () => {
    const { edges, lit } = rest(['.']);
    expect(lit).toBeUndefined();
    expect(
      edges.find((edge) => edge.id === 'import:apps->src')!.imports,
    ).toHaveLength(2);
    expect(edges.filter((edge) => edge.from === 'src')).toEqual([]);
  });

  it('joins only siblings: no line crosses an open card', () => {
    expect(ids(['.', 'src'])).toContain('import:apps->src');
    expect(ids(['.', 'src'])).not.toContain('import:apps->src/app');
    expect(ids(['.', 'src'])).toContain('import:src/app->src/domain');
    expect(ids(['.', 'src'])).toContain(
      'import:src/studio-rpc->src/db/std-table',
    );
  });

  it('draws no line for a Rule nothing uses', () => {
    // src/db/std-table/migrate -> definition is declared but never imported.
    expect(
      ids(['.', 'src', 'src/db/std-table']).some((id) =>
        id.startsWith('import:src/db/std-table/migrate'),
      ),
    ).toBe(false);
  });

  it('draws Violations red between the siblings holding the two files', () => {
    const violation = rest(['.', 'src']).edges.find(
      (edge) => edge.id === 'violation:src/domain->src/infra',
    )!;
    expect(violation.imports[0]!.fromFile).toBe(
      'src/domain/catalog/catalog.ts',
    );
  });
});

describe('laymoLines on a card', () => {
  const on = (key: string, open: readonly string[], toward?: string) =>
    laymoLines(studio, new Set(open), studioAnalysis, {
      kind: 'card',
      key,
      toward,
    });

  it("shows only what crosses a closed card's border", () => {
    const { edges, lit, ruleIds } = on('src/domain', ['.', 'src']);
    expect(edges.map((edge) => edge.id).sort()).toEqual([
      'import:src/app->src/domain',
      'import:src/domain->src/core',
      'violation:src/app->src/domain',
      'violation:src/domain->src/infra',
    ]);
    expect(edges.every((edge) => edge.emphasis === 'lit')).toBe(true);
    expect(lit).toContain('src/app');
    expect(lit).not.toContain('src/sync');
    expect(ruleIds).toContain('rule:src/app->src/domain');
  });

  it('speaks for an open card from its frame, lighting only what crosses it', () => {
    const { edges, lit } = on('src/domain', ['.', 'src', 'src/domain']);
    const ids = edges.map((edge) => edge.id);
    expect(ids).not.toContain('import:src/domain/orders->src/domain/customers');
    expect(ids).toContain('import:src/app->src/domain');
    expect(ids).toContain('violation:src/domain->src/infra');
    expect(
      edges.find((edge) => edge.id === 'import:src/domain->src/core')!.imports,
    ).toHaveLength(3);
    // catalog reaches out to infra; orders is reached by app.
    expect(lit).toContain('src/domain/catalog');
    expect(lit).toContain('src/domain/orders');
    expect(lit).toContain('src/app');
    expect(lit).not.toContain('src/sync');
  });

  it('leaves unlit what an open card holds that talks only inside it', () => {
    const { lit } = on('src/db/std-table', ['.', 'src', 'src/db/std-table']);
    expect(lit).toContain('src/db/std-table/query');
    expect(lit).not.toContain('src/db/std-table/migrate');
  });

  it('shows a nested card both its inner and outer neighbours', () => {
    const ids = on('src/domain/orders', ['.', 'src', 'src/domain']).edges.map(
      (edge) => edge.id,
    );
    expect(ids).toContain('import:src/domain/orders->src/domain/customers');
    expect(ids).toContain('import:src/domain/orders->src/core');
    expect(ids).toContain('violation:src/app->src/domain/orders');
  });

  it('narrows toward one lit card, softening the rest', () => {
    const { edges, lit, soft } = on('src/domain', ['.', 'src'], 'src/core');
    expect([...lit!].sort()).toEqual(['src/core', 'src/domain']);
    expect(soft).toContain('src/app');
    expect(
      edges.find((edge) => edge.id === 'import:src/domain->src/core')!.emphasis,
    ).toBe('lit');
    expect(
      edges.find((edge) => edge.id === 'import:src/app->src/domain')!.emphasis,
    ).toBe('plain');
  });

  it('ignores a card to narrow toward that is not lit', () => {
    const { lit, soft } = on('src/domain', ['.', 'src'], 'src/sync');
    expect(lit).toContain('src/app');
    expect(soft.size).toBe(0);
  });
});

describe('laymoLines on a Rule list entry', () => {
  it('lights the imports it allows and the shown cards at their ends', () => {
    const entry = ruleEntriesOf(studioAnalysis).find(
      (entry) =>
        entry.id === 'rule:src/studio-rpc->src/db/std-table/definition',
    )!;
    const { edges, lit, ruleIds } = laymoLines(
      studio,
      new Set(['.', 'src', 'src/db/std-table']),
      studioAnalysis,
      { kind: 'rule', entry },
    );
    expect([...ruleIds]).toEqual([entry.id]);
    expect([...lit!].sort()).toEqual([
      'src/db/std-table/definition',
      'src/studio-rpc',
    ]);
    expect(edges.map((edge) => edge.id)).toEqual([
      'import:src/studio-rpc->src/db/std-table/definition',
    ]);
  });

  it('reads an import through a Shared Rule as that Rule', () => {
    const entry = ruleEntriesOf(studioAnalysis).find(
      (entry) => entry.id === 'rule:*->src/core/errors',
    )!;
    const { edges } = laymoLines(
      studio,
      new Set(['.', 'src', 'src/core']),
      studioAnalysis,
      { kind: 'rule', entry },
    );
    expect(edges.map((edge) => edge.to)).toContain('src/core/errors');
  });
});

describe('ruleEntriesOf', () => {
  it('lists Rules in Config order, then Exceptions with their Reason', () => {
    const entries = ruleEntriesOf(studioAnalysis);
    expect(entries[0]).toMatchObject({ kind: 'rule', from: 'apps', to: 'src' });
    const exceptions = entries.filter((entry) => entry.kind === 'exception');
    expect(exceptions).toHaveLength(2);
    expect(exceptions.every((entry) => entry.because !== undefined)).toBe(true);
    expect(entries.findIndex((entry) => entry.kind === 'exception')).toBe(
      entries.length - 2,
    );
  });

  it('marks the Rules no import uses', () => {
    expect(
      ruleEntriesOf(studioAnalysis).filter((entry) => entry.unused).length,
    ).toBeGreaterThan(0);
  });
});
