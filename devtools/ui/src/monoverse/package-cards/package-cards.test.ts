import { describe, expect, test } from 'vitest';
import type { ChangeSet } from 'laymos';

import type { MonorepoAnalysis, Package } from '../analysis';
import {
  deletedPackagesOf,
  dependencyKinds,
  packageCards,
} from './package-cards';

function pkg(
  name: string,
  group: string,
  dependencies: Package['dependencies'] = [],
): Package {
  return {
    name: `@kstack/${name}`,
    path: `${group}/${name}`,
    group,
    private: false,
    hasLaymos: false,
    hasStories: false,
    dependencies,
  };
}

const analysis: MonorepoAnalysis = {
  kind: 'monorepo',
  name: 'repo',
  path: '/repo',
  packageManager: 'pnpm',
  packages: [
    pkg('web', 'apps', [{ name: '@kstack/ui', kinds: ['runtime'] }]),
    pkg('ui', 'toolkits', [{ name: '@kstack/std', kinds: ['dev'] }]),
    pkg('std', 'toolkits', [{ name: '@kstack/ui', kinds: ['peer'] }]),
    pkg('solo', 'packages'),
  ],
  violations: [{ packages: ['@kstack/std', '@kstack/ui'] }],
};

const all = new Set(dependencyKinds);

const change = (
  path: string,
  status: 'added' | 'modified' | 'deleted',
): ChangeSet['files'][number] => ({
  path,
  status,
  committed: false,
  uncommitted: true,
});

describe('packageCards', () => {
  test('the Folders layout holds each Package in its Package group', () => {
    const { analysis: drawn, groups } = packageCards({
      analysis,
      layout: 'folders',
      activeKinds: all,
      showDeleted: true,
    });
    const node = (path: string) =>
      drawn.tree.nodes.find((candidate) => candidate.path === path);
    expect(node('.')?.children).toEqual(['apps', 'packages', 'toolkits']);
    expect(node('toolkits')).toMatchObject({
      kind: 'wrapper',
      children: ['toolkits/std', 'toolkits/ui'],
    });
    expect(node('toolkits/ui')).toMatchObject({
      kind: 'module',
      parent: 'toolkits',
    });
    expect(groups).toEqual(['apps', 'packages', 'toolkits']);
  });

  test('the Ranks layout stands every Package in the Monorepo', () => {
    const { analysis: drawn, groups } = packageCards({
      analysis,
      layout: 'ranks',
      activeKinds: all,
      showDeleted: true,
    });
    expect(drawn.tree.nodes.find(({ path }) => path === '.')?.children).toEqual(
      ['apps/web', 'packages/solo', 'toolkits/std', 'toolkits/ui'],
    );
    expect(groups).toEqual([]);
  });

  test('a dependency is a line, and one inside a Package cycle a Violation', () => {
    const { analysis: drawn, findings } = packageCards({
      analysis,
      layout: 'folders',
      activeKinds: all,
      showDeleted: true,
    });
    expect(
      drawn.imports.map(({ fromModule, toModule, verdict }) => [
        fromModule,
        toModule,
        verdict.kind,
      ]),
    ).toEqual([
      ['apps/web', 'toolkits/ui', 'rule'],
      ['toolkits/ui', 'toolkits/std', 'violation'],
      ['toolkits/std', 'toolkits/ui', 'violation'],
    ]);
    expect(findings[0]).toMatchObject({
      count: 1,
      first: 'toolkits/std',
      title: '@kstack/std → @kstack/ui → @kstack/std',
    });
  });

  test('hiding a Dependency kind drops its lines', () => {
    const { analysis: drawn } = packageCards({
      analysis,
      layout: 'folders',
      activeKinds: new Set(['runtime']),
      showDeleted: true,
    });
    expect(drawn.imports.map(({ toModule }) => toModule)).toEqual([
      'toolkits/ui',
    ]);
  });

  test('change statuses roll up from files to Packages to Package groups', () => {
    const { changeIndex } = packageCards({
      analysis,
      layout: 'folders',
      activeKinds: all,
      changes: {
        baseRef: 'HEAD',
        files: [
          change('toolkits/ui/src/index.ts', 'modified'),
          change('packages/solo/package.json', 'added'),
          change('README.md', 'modified'),
        ],
      },
      knownFiles: [
        'toolkits/ui/package.json',
        'toolkits/ui/src/index.ts',
        'packages/solo/package.json',
        'README.md',
      ],
      showDeleted: true,
    });
    expect(Object.fromEntries(changeIndex!.modules)).toEqual({
      'toolkits/ui': 'modified',
      toolkits: 'modified',
      'packages/solo': 'added',
      packages: 'added',
    });
  });

  test('a Deleted Package stands in its Package group, read as deleted', () => {
    const changes: ChangeSet = {
      baseRef: 'main',
      files: [
        change('toolkits/old/package.json', 'deleted'),
        change('toolkits/old/src/index.ts', 'deleted'),
      ],
    };
    const shown = packageCards({
      analysis,
      layout: 'folders',
      activeKinds: all,
      changes,
      showDeleted: true,
    });
    expect(shown.deleted).toEqual(['toolkits/old']);
    expect(shown.packages.get('toolkits/old')).toBeUndefined();
    expect(shown.packages.has('toolkits/old')).toBe(true);
    expect(
      shown.analysis.tree.nodes.find(({ path }) => path === 'toolkits')
        ?.children,
    ).toContain('toolkits/old');
    expect(shown.changeIndex!.modules.get('toolkits/old')).toBe('deleted');
    expect(shown.changeIndex!.modules.get('toolkits')).toBe('modified');

    const hidden = packageCards({
      analysis,
      layout: 'folders',
      activeKinds: all,
      changes,
      showDeleted: false,
    });
    expect(hidden.packages.has('toolkits/old')).toBe(false);
  });
});

describe('a Single Package', () => {
  const single: MonorepoAnalysis = {
    kind: 'single-package',
    name: '@kstack/solo',
    path: '/work/solo',
    packageManager: 'npm',
    packages: [
      {
        name: '@kstack/solo',
        path: '.',
        group: '.',
        private: false,
        hasLaymos: true,
        hasStories: false,
        dependencies: [],
      },
    ],
    violations: [],
  };

  test('draws its one Package as a card named by its folder, holding every file', () => {
    const cards = packageCards({
      analysis: single,
      layout: 'folders',
      activeKinds: all,
      changes: {
        baseRef: 'HEAD',
        files: [
          change('src/index.ts', 'modified'),
          change('fixtures/package.json', 'deleted'),
        ],
      },
      knownFiles: ['package.json', 'src/index.ts'],
      showDeleted: true,
    });
    const node = (path: string) =>
      cards.analysis.tree.nodes.find((candidate) => candidate.path === path);
    expect(node('.')?.children).toEqual(['solo']);
    expect(node('solo')).toMatchObject({ kind: 'module', parent: '.' });
    expect(cards.packages.get('solo')).toBe(single.packages[0]);
    expect(cards.folderOf('solo')).toBe('.');
    expect(cards.deleted).toEqual([]);
    expect(cards.changeIndex!.modules.get('solo')).toBe('modified');
  });
});

describe('deletedPackagesOf', () => {
  test('ignores a manifest deleted outside every folder holding Packages', () => {
    expect(
      deletedPackagesOf(analysis.packages, {
        baseRef: 'HEAD',
        files: [
          change('toolkits/ui/tests/fixtures/app/package.json', 'deleted'),
          change('package.json', 'deleted'),
          change('apps/gone/package.json', 'deleted'),
          change('apps/web/package.json', 'deleted'),
        ],
      }),
    ).toEqual(['apps/gone']);
  });
});
