import { describe, expect, it } from 'vitest';
import type { Definition, Entry, Instance } from 'effect-oak';
import { CARD, CIRCLE, mapOf, workersId } from './map.ts';
import type { ActorNode, StateNode } from './map.ts';

const leaf: Definition = {
  name: 'Item',
  states: ['Single'],
  workers: {},
  children: {},
} as unknown as Definition;

const list: Definition = {
  name: 'List',
  states: ['Single'],
  workers: {},
  children: { Single: { items: { definition: leaf, many: true } } },
} as unknown as Definition;

const ONE = [''];
const NONE: ReadonlyArray<string> = [];

/** A Watch: ticks while Running, and uploads one per key in its Model. */
const watch: Definition = {
  name: 'Watch',
  states: ['Stopped', 'Running'],
  workers: {
    tick: {
      kind: 'state',
      state: 'Running',
      keys: ({ state }: { state: { _tag: string } }) =>
        state._tag === 'Running' ? ONE : NONE,
      run: () => undefined,
    },
    upload: {
      kind: 'each',
      keys: ({ model }: { model: { uploads: ReadonlyArray<string> } }) =>
        model.uploads,
      run: () => undefined,
    },
  },
  children: {},
} as unknown as Definition;

const watching = (tag: string, uploads: ReadonlyArray<string>): Instance => ({
  id: 'Watch',
  actor: 'Watch',
  state: { _tag: tag },
  model: { uploads },
  children: {},
  invoked: {},
});

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

  it('keeps Workers off the map, as a badge counting the keys expected', () => {
    const was = watching('Stopped', []);
    const is = watching('Running', ['a', 'b']);
    const map = mapOf(watch, { before: was, after: is }, entry, new Set());
    expect(map.nodes.map((node) => node.kind)).toEqual([
      'actor',
      'state',
      'state',
    ]);
    expect(map.nodes.find((node) => node.id === 'Watch')).toMatchObject({
      workers: { count: 2, status: 'started', open: false },
    });
    expect(
      map.nodes.find((node) => node.id === 'Watch::Running'),
    ).toMatchObject({ workers: { count: 1, status: 'started' } });
    expect(
      map.nodes.find((node) => node.id === 'Watch::Stopped'),
    ).toMatchObject({ workers: undefined });
  });

  it('mutes the badge when nothing is expected, and never draws one without Workers', () => {
    const map = mapOf(
      watch,
      { before: undefined, after: watching('Stopped', []) },
      'init',
      new Set(),
    );
    expect(map.nodes.find((node) => node.id === 'Watch')).toMatchObject({
      workers: { count: 0, status: 'dim' },
    });
    const plain = mapOf(
      list,
      { before: undefined, after: instance('List', []) },
      'init',
      new Set(),
    );
    expect(plain.nodes.find((node) => node.id === 'List')).toMatchObject({
      workers: undefined,
    });
  });

  it('opens an Actor’s Workers as a card its node grows into, pushing its States down', () => {
    // Enough keys that the pills wrap, so the card is taller than a circle and its label.
    const more = Array.from({ length: 12 }, (_, i) => `upload-${i}`);
    const was = watching('Running', ['a', 'b', ...more]);
    const is = watching('Running', ['b', 'c', ...more]);
    const closed = mapOf(watch, { before: was, after: is }, entry, new Set());
    const open = mapOf(
      watch,
      { before: was, after: is },
      entry,
      new Set([workersId('Watch')]),
    );
    const actor = (map: ReturnType<typeof mapOf>) =>
      map.nodes.find((node) => node.id === 'Watch')!;
    expect(actor(closed)).toMatchObject({ card: undefined });
    expect(actor(open)).toMatchObject({
      workers: { count: 14, open: true },
      card: { instance: 'Watch', workers: [{ name: 'upload', kind: 'each' }] },
    });
    const { card } = actor(open) as ActorNode;
    expect(card!.workers[0]!.keys.slice(0, 2)).toEqual([
      { key: 'b', life: 'kept' },
      { key: 'c', life: 'started' },
    ]);
    expect(card!.workers[0]!.keys.at(-1)).toEqual({
      key: 'a',
      life: 'stopped',
    });
    expect(card!.width).toBe(CARD.max);
    expect(card!.height).toBeGreaterThan(CIRCLE);
    const pill = (map: ReturnType<typeof mapOf>) =>
      map.nodes.find((node) => node.id === 'Watch::Running')!.y;
    expect(pill(open)).toBeGreaterThan(pill(closed));
    expect(pill(open)).toBeGreaterThan(actor(open).y + card!.height / 2);
    expect(open.width).toBeGreaterThanOrEqual(card!.width);
    expect(open.height).toBeGreaterThan(closed.height);
  });

  it('makes a card wide enough for a row of short keys, so it does not wrap', () => {
    const is = watching('Running', ['a', 'b', 'c']);
    const map = mapOf(
      watch,
      { before: undefined, after: is },
      'init',
      new Set([workersId('Watch')]),
    );
    const { card } = map.nodes.find((node) => node.id === 'Watch') as ActorNode;
    // Three pills with their live dots, after the Worker's name and kind.
    expect(card!.width).toBeGreaterThan(CARD.min);
    expect(card!.width).toBeLessThan(CARD.max);
    expect(card!.height).toBe(
      CARD.pad * 2 + CARD.head + 4 + CARD.line + CARD.slack,
    );
  });

  it('keeps the root at x 0 with its centre still, its card growing around it', () => {
    const is = watching('Running', ['a', 'b', 'c']);
    const closed = mapOf(
      watch,
      { before: undefined, after: is },
      'init',
      new Set(),
    );
    const open = mapOf(
      watch,
      { before: undefined, after: is },
      'init',
      new Set([workersId('Watch')]),
    );
    const root = (map: ReturnType<typeof mapOf>) =>
      map.nodes.find((node) => node.id === 'Watch')!;
    expect(root(closed)).toMatchObject({ x: 0 });
    expect(root(open)).toMatchObject({ x: 0, y: root(closed).y });
    const { card } = root(open) as ActorNode;
    // The extra half goes up, past y 0, and the rest goes down.
    expect(open.top).toBeLessThanOrEqual(0);
    expect(open.top).toBeLessThanOrEqual(root(open).y - card!.height / 2);
    expect(closed.top).toBe(0);
    const edge = open.edges.find((e) => e.id === 'Watch->Watch::Running')!;
    expect(edge.d.startsWith(`M 0 ${root(open).y + card!.height / 2} `)).toBe(
      true,
    );
  });

  it('opens a State’s Workers as a card of its own, apart from the Actor’s', () => {
    const is = watching('Running', []);
    const map = mapOf(
      watch,
      { before: undefined, after: is },
      'init',
      new Set([workersId('Watch::Running')]),
    );
    const state = map.nodes.find(
      (node) => node.id === 'Watch::Running',
    ) as StateNode;
    expect(state.card).toMatchObject({
      workers: [{ name: 'tick', keys: [{ key: '', life: 'started' }] }],
    });
    expect(map.nodes.find((node) => node.id === 'Watch')).toMatchObject({
      card: undefined,
    });
    expect(
      map.nodes.find((node) => node.id === 'Watch::Stopped'),
    ).toMatchObject({ card: undefined });
  });
});
