import { describe, it, expect } from 'vitest';

import { buildLayerCardGroups, chipKeys } from './layer-cards';
import type { ModuleNode } from '../modules';

const mod = (
  name: string,
  overrides: Partial<ModuleNode> = {},
): ModuleNode => ({
  key: `routes::${name}`,
  layer: 'routes',
  name,
  feature: null,
  visibility: 'private',
  sharedWith: [],
  fileCount: 0,
  breachCount: 0,
  isBreached: false,
  ...overrides,
});

describe('buildLayerCardGroups', () => {
  it('nests a module under the module whose name prefixes it', () => {
    const groups = buildLayerCardGroups(
      [mod('otel'), mod('otel/internal')],
      new Set(['routes::otel', 'routes::otel/internal']),
    );

    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group!.folder).toBeNull();
    expect(group!.chips).toHaveLength(1);
    expect(group!.chips[0]!.label).toBe('otel');
    expect(group!.chips[0]!.children.map((c) => c.label)).toEqual(['internal']);
  });

  it('nests under the deepest prefixing module', () => {
    const groups = buildLayerCardGroups(
      [mod('a'), mod('a/b'), mod('a/b/c')],
      new Set(),
    );

    const a = groups[0]!.chips[0]!;
    expect(a.children.map((c) => c.label)).toEqual(['b']);
    expect(a.children[0]!.children.map((c) => c.label)).toEqual(['c']);
  });

  it('groups root modules by parent folder with relative labels', () => {
    const groups = buildLayerCardGroups(
      [mod('blocks/viz'), mod('blocks/hello'), mod('form')],
      new Set(),
    );

    expect(groups.map((g) => g.folder)).toEqual([null, 'blocks']);
    expect(groups[0]!.chips.map((c) => c.label)).toEqual(['form']);
    expect(groups[1]!.chips.map((c) => c.label)).toEqual(['hello', 'viz']);
  });

  it('does not treat folder prefixes as containment without a module', () => {
    // No `blocks` module exists, so blocks/viz stays a root chip in a group.
    const groups = buildLayerCardGroups([mod('blocks/viz')], new Set());
    expect(groups[0]!.folder).toBe('blocks');
    expect(groups[0]!.chips[0]!.children).toEqual([]);
  });

  it('orders declared chips before discovered ones within a group', () => {
    const groups = buildLayerCardGroups(
      [mod('alpha'), mod('beta'), mod('gamma')],
      new Set(['routes::gamma']),
    );

    expect(groups[0]!.chips.map((c) => c.label)).toEqual([
      'gamma',
      'alpha',
      'beta',
    ]);
    expect(groups[0]!.chips.map((c) => c.declared)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('labels a module whose path equals the layer path as (layer root)', () => {
    const groups = buildLayerCardGroups([mod('')], new Set());
    expect(groups[0]!.chips[0]!.label).toBe('(layer root)');
  });
});

describe('chipKeys', () => {
  it('returns the chip key and all descendant keys', () => {
    const groups = buildLayerCardGroups(
      [mod('a'), mod('a/b'), mod('a/b/c')],
      new Set(),
    );
    expect(chipKeys(groups[0]!.chips[0]!)).toEqual([
      'routes::a',
      'routes::a/b',
      'routes::a/b/c',
    ]);
  });
});
