import { describe, expect, test } from 'vitest';
import type { MonorepoAnalysis, Package } from '../analysis';

import {
  groupHue,
  groupPackages,
  packageCycles,
  packageRelations,
  rankPackages,
  resolvePackageFocus,
  strongestDependencyKind,
  visibleEdges,
} from './monorepo-presentation';

function pkg(
  name: string,
  dependencies: Package['dependencies'] = [],
  extra: Partial<Package> = {},
): Package {
  return {
    name,
    path: `packages/${name}`,
    group: 'packages',
    private: false,
    hasLaymos: false,
    dependencies,
    ...extra,
  };
}

const analysis: MonorepoAnalysis = {
  name: 'acme',
  path: '/acme',
  packages: [
    pkg(
      'app',
      [
        { name: 'ui', kinds: ['runtime'] },
        { name: 'std', kinds: ['dev'] },
      ],
      { group: 'apps' },
    ),
    pkg('ui', [{ name: 'std', kinds: ['peer', 'dev'] }]),
    pkg('std'),
    pkg('lonely'),
    pkg('external-user', [{ name: 'react', kinds: ['runtime'] }]),
  ],
  violations: [],
};

const allKinds = new Set(['runtime', 'dev', 'peer', 'optional'] as const);

describe('visibleEdges', () => {
  test('draws one edge per Package pair with its strongest kind', () => {
    const edges = visibleEdges(analysis, allKinds);
    expect(edges.map(({ id, strongestKind }) => [id, strongestKind])).toEqual([
      ['app->ui', 'runtime'],
      ['app->std', 'dev'],
      ['ui->std', 'peer'],
    ]);
  });

  test('hides a pair only when no active kind remains', () => {
    const edges = visibleEdges(analysis, new Set(['dev'] as const));
    expect(edges.map(({ id, kinds }) => [id, kinds])).toEqual([
      ['app->std', ['dev']],
      ['ui->std', ['dev']],
    ]);
  });

  test('orders strength runtime > peer > optional > dev', () => {
    expect(strongestDependencyKind(['dev', 'optional', 'peer'])).toBe('peer');
    expect(strongestDependencyKind(['dev', 'runtime'])).toBe('runtime');
    expect(strongestDependencyKind(['dev', 'optional'])).toBe('optional');
  });
});

describe('rankPackages', () => {
  test('places a Package below everything that depends on it', () => {
    const stack = rankPackages(
      analysis.packages,
      visibleEdges(analysis, allKinds),
    );
    expect(stack.ranks).toEqual([['app'], ['ui'], ['std']]);
    expect(stack.isolated).toEqual(['external-user', 'lonely']);
  });

  test('terminates on a Package cycle and keeps its members ranked', () => {
    const cyclic: MonorepoAnalysis = {
      ...analysis,
      packages: [
        pkg('a', [{ name: 'b', kinds: ['runtime'] }]),
        pkg('b', [{ name: 'a', kinds: ['runtime'] }]),
        pkg('c', [{ name: 'a', kinds: ['runtime'] }]),
      ],
    };
    const stack = rankPackages(cyclic.packages, visibleEdges(cyclic, allKinds));
    expect(stack.ranks.flat().sort()).toEqual(['a', 'b', 'c']);
    expect(stack.isolated).toEqual([]);
    expect(stack.ranks.length).toBeGreaterThan(1);
  });
});

describe('resolvePackageFocus', () => {
  const edges = visibleEdges(analysis, allKinds);

  test('emphasizes the target with its direct dependencies and dependents', () => {
    const focus = resolvePackageFocus({ hoveredPackage: 'ui', edges });
    expect(focus.focusedPackage).toBe('ui');
    expect([...focus.emphasizedPackages].sort()).toEqual(['app', 'std', 'ui']);
    expect([...focus.emphasizedEdgeIds].sort()).toEqual(['app->ui', 'ui->std']);
  });

  test('hovering a member of the selection singles it out', () => {
    // std is selected; its neighbourhood is app and ui. Hovering ui keeps
    // that neighbourhood and singles out ui and the std–ui edge.
    const focus = resolvePackageFocus({
      selectedPackage: 'std',
      hoveredPackage: 'ui',
      edges,
    });
    expect(focus.focusedPackage).toBe('ui');
    expect([...focus.emphasizedPackages].sort()).toEqual(['std', 'ui']);
    expect([...focus.emphasizedEdgeIds]).toEqual(['ui->std']);
    expect([...focus.softenedPackages]).toEqual(['app']);
    expect([...focus.softenedEdgeIds]).toEqual(['app->std']);
  });

  test('hovering outside the selection changes nothing', () => {
    const focus = resolvePackageFocus({
      selectedPackage: 'std',
      hoveredPackage: 'lonely',
      edges,
    });
    expect(focus.focusedPackage).toBe('std');
    expect([...focus.emphasizedPackages].sort()).toEqual(['app', 'std', 'ui']);
    expect(focus.softenedPackages.size).toBe(0);
  });

  test('a selection alone is the focus', () => {
    const focus = resolvePackageFocus({ selectedPackage: 'std', edges });
    expect(focus.focusedPackage).toBe('std');
    expect(focus.softenedEdgeIds.size).toBe(0);
  });

  test('emphasizes nothing without a target', () => {
    const focus = resolvePackageFocus({ edges });
    expect(focus.focusedPackage).toBeUndefined();
    expect(focus.emphasizedPackages.size).toBe(0);
  });
});

describe('decorations and details', () => {
  test('groups Packages under their Package group in name order', () => {
    expect(
      groupPackages(analysis.packages).map(({ group, packages }) => [
        group,
        packages.map(({ name }) => name),
      ]),
    ).toEqual([
      ['apps', ['app']],
      ['packages', ['external-user', 'lonely', 'std', 'ui']],
    ]);
  });

  test('lists dependencies and dependents across every kind', () => {
    expect(packageRelations(analysis, 'std')).toEqual({
      dependencies: [],
      dependents: [
        { name: 'app', kinds: ['dev'] },
        { name: 'ui', kinds: ['peer', 'dev'] },
      ],
    });
  });

  test('finds the cycles a Package belongs to', () => {
    const violations = [{ packages: ['a', 'b'] }, { packages: ['c', 'd'] }];
    expect(packageCycles({ ...analysis, violations }, 'b')).toEqual([
      { packages: ['a', 'b'] },
    ]);
  });

  test('derives a stable hue per Package group', () => {
    expect(groupHue('apps')).toBe(groupHue('apps'));
    expect(groupHue('apps')).toBeGreaterThanOrEqual(0);
    expect(groupHue('apps')).toBeLessThan(360);
  });
});
