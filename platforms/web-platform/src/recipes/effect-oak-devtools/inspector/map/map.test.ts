import { describe, expect, it } from 'vitest';
import type { Definition, Entry, Instance } from 'effect-oak';
import { mapOf } from './map.ts';

const leaf: Definition = {
  name: 'Item',
  states: ['Single'],
  children: {},
} as unknown as Definition;

const list: Definition = {
  name: 'List',
  states: ['Single'],
  children: { Single: { items: { definition: leaf, many: true } } },
} as unknown as Definition;

const instance = (id: string, items?: ReadonlyArray<Instance>): Instance => ({
  id,
  actor: items ? 'List' : 'Item',
  state: { _tag: 'Single' },
  model: {},
  children: items ? { items } : {},
  invoked: {},
});

const entry = {
  id: 0,
  instance: 'List',
  source: { kind: 'view', instance: 'List' },
} as unknown as Entry;

const open = new Set(['List::Single.items']);

const xOf = (map: ReturnType<typeof mapOf>) =>
  Object.fromEntries(map.nodes.map((node) => [node.id, node.x]));

describe('the app map', () => {
  it('keeps a stopped Child in its place, with a new one to its right', () => {
    const a = instance('List/a');
    const was = instance('List', [a, instance('List/b')]);
    const is = instance('List', [a, instance('List/c')]);

    const before = xOf(
      mapOf(list, { before: undefined, after: was }, 'init', open),
    );
    const after = xOf(mapOf(list, { before: was, after: is }, entry, open));

    expect(after['List']).toBe(0);
    expect(before['List']).toBe(0);
    expect(after['List/a']).toBeLessThan(after['List/b']!);
    expect(after['List/c']).toBeGreaterThan(after['List/b']!);
  });

  it('never moves the root, however many Children come and go', () => {
    const a = instance('List/a');
    const one = instance('List', [a]);
    const three = instance('List', [a, instance('List/b'), instance('List/c')]);

    const before = xOf(
      mapOf(list, { before: undefined, after: one }, 'init', open),
    );
    const after = xOf(mapOf(list, { before: one, after: three }, entry, open));

    expect(before['List']).toBe(0);
    expect(after['List']).toBe(0);
  });

  it('draws no State for an Actor without States', () => {
    const map = mapOf(
      list,
      { before: undefined, after: instance('List', []) },
      'init',
      new Set(),
    );
    expect(map.nodes.map((node) => node.kind)).toEqual(['actor', 'many']);
  });

  it('draws a closed keyed Child as one node with its count', () => {
    const map = mapOf(
      list,
      { before: undefined, after: instance('List', [instance('List/a')]) },
      'init',
      new Set(),
    );
    expect(map.nodes.find((node) => node.kind === 'many')).toMatchObject({
      actor: 'Item',
      count: 1,
      open: false,
    });
    expect(map.at.get('List/a')).toBe('List::Single.items');
  });
});
