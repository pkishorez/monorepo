import { describe, it, expect } from 'vitest';

import { buildModuleTree, moduleTreeKeys } from './layer-cards';
import type { ModuleNode } from '../modules';

const mod = (
  name: string,
  overrides: Partial<ModuleNode> = {},
): ModuleNode => ({
  key: `routes::${name}`,
  layer: 'routes',
  name,
  opaque: false,
  ruleCount: 0,
  role: 'normal',
  fileCount: 0,
  breachCount: 0,
  isBreached: false,
  ...overrides,
});

describe('buildModuleTree', () => {
  it('places top-level (no folder) modules as leaf nodes at the root', () => {
    const tree = buildModuleTree(
      [mod('index.tsx'), mod('__root.tsx')],
      new Set(),
    );
    expect(tree.map((n) => n.kind)).toEqual(['module', 'module']);
    expect(tree.map((n) => (n.kind === 'module' ? n.label : ''))).toEqual([
      '__root.tsx',
      'index.tsx',
    ]);
  });

  it('groups modules under a folder placeholder by their path', () => {
    const tree = buildModuleTree(
      [mod('dev/components'), mod('dev/forms.tsx'), mod('dev/ui.tsx')],
      new Set(),
    );
    expect(tree).toHaveLength(1);
    const folder = tree[0]!;
    expect(folder.kind).toBe('folder');
    if (folder.kind !== 'folder') return;
    expect(folder.label).toBe('dev');
    expect(
      folder.children.map((c) => (c.kind === 'module' ? c.label : '')),
    ).toEqual(['components', 'forms.tsx', 'ui.tsx']);
  });

  it('collapses a single-subfolder chain into one a/b node', () => {
    const tree = buildModuleTree(
      [mod('a/b/c'), mod('a/b/file.tsx')],
      new Set(),
    );
    expect(tree).toHaveLength(1);
    const folder = tree[0]!;
    expect(folder.kind).toBe('folder');
    if (folder.kind !== 'folder') return;
    expect(folder.label).toBe('a/b');
    expect(
      folder.children.map((c) => (c.kind === 'module' ? c.label : '')),
    ).toEqual(['c', 'file.tsx']);
  });

  it('does not collapse a folder that also holds a subfolder', () => {
    const tree = buildModuleTree(
      [mod('b/c'), mod('b/file.tsx'), mod('b/d/hello.tsx')],
      new Set(),
    );
    const b = tree[0]!;
    expect(b.kind).toBe('folder');
    if (b.kind !== 'folder') return;
    expect(b.label).toBe('b');
    // modules first (c, file.tsx), then the subfolder d/
    expect(b.children.map((c) => c.kind)).toEqual([
      'module',
      'module',
      'folder',
    ]);
    const d = b.children[2]!;
    expect(d.kind === 'folder' && d.label).toBe('d');
  });

  it('orders modules before folders, declared modules first', () => {
    const tree = buildModuleTree(
      [mod('beta'), mod('alpha'), mod('sub/x')],
      new Set(['routes::beta']),
    );
    expect(
      tree.map((n) => (n.kind === 'module' ? n.label : `${n.label}/`)),
    ).toEqual(['beta', 'alpha', 'sub/']);
  });

  it('labels a module whose path equals the layer path as (layer root)', () => {
    const tree = buildModuleTree([mod('')], new Set());
    expect(tree[0]!.kind === 'module' && tree[0]!.label).toBe('(layer root)');
  });
});

describe('moduleTreeKeys', () => {
  it('returns every module key beneath a folder', () => {
    const tree = buildModuleTree(
      [mod('a/b/c'), mod('a/b/file.tsx')],
      new Set(),
    );
    expect(moduleTreeKeys(tree[0]!).sort()).toEqual([
      'routes::a/b/c',
      'routes::a/b/file.tsx',
    ]);
  });
});
