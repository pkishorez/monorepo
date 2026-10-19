import { describe, expect, it } from 'vitest';
import { sceneOf } from '../scene/index.ts';
import type { Kind, Placed } from '../scene/index.ts';
import { SHOP_STEPS, ShopLive } from './fixtures/steps.ts';

const scene = (
  step: number,
  extra: Partial<Parameters<typeof sceneOf>[0]> = {},
) =>
  sceneOf({
    definition: ShopLive.definition,
    snapshot: SHOP_STEPS[step]!.snapshot,
    ...(SHOP_STEPS[step]!.said ? { said: SHOP_STEPS[step]!.said } : {}),
    ...extra,
  });

const described = (node: Placed) => {
  const states = node.states
    ?.flat()
    .map(
      (option) =>
        `${option.tag}${node.many ? ` ${option.count}` : option.count ? '*' : ''}`,
    )
    .join(' ');
  const workers = node.workers
    .map((row) => `${row.name}:${row.keys.length}`)
    .join(' ');
  return [
    `${node.name}${node.many ? `×${node.instances.length}` : node.lit ? '' : '?'}`,
    states && `(${states})`,
    workers && `[${workers}]`,
  ]
    .filter(Boolean)
    .join(' ');
};

const overlaps = (a: Placed, b: Placed) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe('the Scene', () => {
  it('draws one card per place, with its States as options and every Worker it has as a row', () => {
    expect(scene(4).nodes.map(described)).toEqual([
      'Shop (Loading Open* Closed) [fetch:0]',
      'Catalog [thumb:2]',
      'Item×3 (Idle 2 Saving 1) [save:1]',
      'Cart (Empty Filled* Checkout) [pay:0]',
      'Session [heartbeat:1]',
    ]);
  });

  it('puts a node per State that starts something between a card and what that State starts', () => {
    const states = (step: number) =>
      scene(step).states.map(
        (state) =>
          `${state.id}${state.active ? '*' : ''}${state.names ? ` (${state.names.join(', ')})` : ''}`,
      );
    expect(states(0)).toEqual([
      'Shop~Open (Catalog, Cart)',
      'Shop~Closed (Notice)',
    ]);
    expect(states(4)).toEqual(['Shop~Open*', 'Shop~Closed (Notice)']);
    expect(
      scene(4).lines.map((line) => `${line.from} -> ${line.to}`),
    ).toContain('Shop~Open -> Shop>catalog');
  });

  for (const kind of ['tree', 'outline'] satisfies ReadonlyArray<Kind>)
    it(`lays every Step out as a ${kind}, no two cards touching`, () => {
      for (let step = 0; step < SHOP_STEPS.length; step++) {
        const shown = scene(step, { layout: kind });
        for (const node of shown.nodes) {
          for (const other of shown.nodes)
            if (other !== node)
              expect(overlaps(node, other), `${node.id} and ${other.id}`).toBe(
                false,
              );
        }
      }
    });

  it('keeps the root at the top', () => {
    expect(scene(0).at.get('Shop')).toMatchObject({ y: 0 });
    expect(scene(0, { layout: 'outline' }).at.get('Shop')).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it('draws what a State starts only while the card is in it, and folds it away with a fold', () => {
    const toCart = (step: number, extra = {}) =>
      scene(step, extra).lines.find((line) => line.to === 'Shop>cart');
    expect(toCart(0)).toBeUndefined();
    expect(toCart(1)).toMatchObject({ from: 'Shop~Open', lit: true });
    expect(toCart(1, { folded: new Set(['Shop']) })).toBeUndefined();
    expect(
      scene(1, { folded: new Set(['Shop']) }).at.get('Shop')!.folded,
    ).toEqual({
      names: ['Catalog', 'Cart', 'Notice', 'Session'],
      hidden: 5,
    });
  });

  it('beats a Worker’s Send at the row of the Worker that Sent it, even once its key ended', () => {
    expect(scene(1).beats!.send).toEqual({
      at: 'Shop',
      by: 'fetch',
      worker: 'fetch',
    });
    expect(scene(2).beats!.send).toEqual({
      at: 'Shop>catalog',
      by: 'thumb#tea',
      worker: 'thumb',
    });
  });

  it('beats a Request from the Node that asked, and the Commands asked for', () => {
    expect(scene(3).beats).toMatchObject({
      tag: 'Put',
      send: { by: 'View' },
      commands: [{ name: 'track', args: { count: 1 } }],
    });
    // Cart asked, and the Message stopped it: it beats at the nearest card still drawn.
    expect(scene(7).beats).toMatchObject({ to: 'Shop', send: { at: 'Shop' } });
  });

  it('says only that a Worker key is on away from the live app, and how it does while live', () => {
    const fetch = (shown: ReturnType<typeof scene>) =>
      shown.at.get('Shop')!.workers.find((row) => row.name === 'fetch')!;
    expect(fetch(scene(0)).keys).toMatchObject([{ status: 'on' }]);
    expect(
      fetch(
        scene(0, {
          statuses: () => [{ name: 'fetch', key: '', status: 'failed' }],
        }),
      ).keys,
    ).toMatchObject([{ status: 'failed' }]);
  });
});
