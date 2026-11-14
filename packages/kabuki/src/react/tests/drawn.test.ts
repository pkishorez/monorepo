import { describe, expect, it } from 'vitest';
import type { Address, Snapshot } from '../../core/index.ts';
import type { Instance } from '../../core/snapshot/index.ts';
import { makeDrawn } from '../view/drawn.ts';

/*
 * What Views read lets go of an Instance once it is in no Snapshot drawn, and
 * tells only the listeners at the Addresses whose Instance changed, came or
 * went.
 */

const single = { _tag: 'Single' };
const none = {};

const instance = (
  address: string,
  children: Instance['children'] = {},
  model: object = none,
): Instance => ({
  _tag: 'Single',
  address: address as Address,
  actor: 'A',
  state: single,
  model,
  children,
  invoked: {},
});

const at = (root: Instance): Snapshot => ({ root, at: 0 });

describe('what Views read', () => {
  it('forgets a keyed Child once it is gone from the Snapshot', () => {
    const row = instance('List/rows[a]#1');
    const full = at(instance('List', { rows: [row] }));
    const empty = at(instance('List', { rows: [] }));
    let now = full;
    const drawn = makeDrawn(
      () => now,
      () => undefined,
      () => {},
      () => () => {},
    );
    const before = drawn.instance(row.address)!;
    expect(drawn.instance(row.address)).toBe(before);

    now = empty;
    expect(drawn.instance('List' as Address)).toBeDefined();
    expect(drawn.instance(row.address)).toBeUndefined();

    // Back again, as when the past is shown: drawn anew, nothing was kept.
    now = full;
    const after = drawn.instance(row.address)!;
    expect(after).not.toBe(before);
    expect(after.send).not.toBe(before.send);
  });
});

// A List of a Header and keyed rows, drawn from a Snapshot set by hand -----------------

const HEADER = 'List/header#1';
const row = (key: string, model: object = none) =>
  instance(`List/rows[${key}]#1`, {}, model);
const list = (
  rows: ReadonlyArray<Instance>,
  header = instance(HEADER),
  model: object = none,
) => instance('List', { header, rows }, model);

/** Draws `first`, and tells whoever listens of each Snapshot drawn after it. */
const drawing = (first: Snapshot) => {
  let now = first;
  const source = new Set<() => void>();
  const drawn = makeDrawn(
    () => now,
    () => undefined,
    () => {},
    (listener) => {
      source.add(listener);
      return () => {
        source.delete(listener);
      };
    },
  );
  let told: Array<string> = [];
  const listen = (...addresses: ReadonlyArray<string>) => {
    const listener = () => told.push(addresses.join(' '));
    const leave = addresses.map((address) =>
      drawn.subscribeAt(address as Address)(listener),
    );
    return () => {
      for (const one of leave) one();
    };
  };
  const draw = (next: Snapshot) => {
    now = next;
    told = [];
    for (const listener of source) listener();
    return told;
  };
  return { drawn, source, listen, draw };
};

describe('telling the Views that changed', () => {
  const a = row('a');
  const b = row('b');
  const c = row('c');
  const header = instance(HEADER);
  const start = at(list([a, b, c], header));

  it('tells only the listeners at the Instance that changed', () => {
    const { listen, draw } = drawing(start);
    for (const address of ['List', HEADER, a.address, b.address, c.address])
      listen(address);
    expect(draw(at(list([a, row('b', { bumps: 1 }), c], header)))).toEqual([
      b.address,
    ]);
  });

  it('a keyed Child that comes or goes tells its parent and itself only', () => {
    const { listen, draw } = drawing(start);
    for (const address of ['List', HEADER, a.address, b.address, c.address])
      listen(address);
    listen('List/rows[d]#1');
    const d = row('d');
    expect(draw(at(list([a, b, c, d], header)))).toEqual(['List', d.address]);
    expect(draw(at(list([a, c, d], header)))).toEqual(['List', b.address]);
  });

  it('a Message that changes nothing tells no one', () => {
    const { listen, draw } = drawing(start);
    listen('List');
    listen(a.address);
    expect(draw({ ...start, at: 1 })).toEqual([]);
  });

  it('a Snapshot swapped whole, as by a Seek, tells every Instance that differs', () => {
    const { drawn, listen, draw } = drawing(start);
    for (const address of ['List', HEADER, a.address, b.address, c.address])
      listen(address);
    const past = at(
      list([row('a'), row('b', { bumps: 1 })], instance(HEADER), {
        title: 'Past',
      }),
    );
    expect(draw(past).sort()).toEqual(['List', b.address, c.address].sort());
    expect(drawn.instance(c.address)).toBeUndefined();

    // An Instance at the same Address again tells its listeners.
    expect(draw(start).sort()).toEqual(['List', b.address, c.address].sort());
    expect(drawn.instance(c.address)).toBeDefined();
  });

  it('tells a listener at many Children once, and not when another changes', () => {
    const { listen, draw } = drawing(start);
    listen(a.address, b.address, c.address);
    const bumped = [row('a', { bumps: 1 }), row('b', { bumps: 1 }), c];
    expect(draw(at(list(bumped, header)))).toHaveLength(1);
    expect(draw(at(list(bumped, instance(HEADER, {}, { clicks: 1 }))))).toEqual(
      [],
    );
  });

  it('follows its source only while something listens, and keeps nothing after', () => {
    const { source, listen, draw } = drawing(start);
    // As StrictMode does: subscribe, let go, and subscribe again.
    listen(a.address)();
    expect(source.size).toBe(0);
    const leaveA = listen(a.address);
    const leaveB = listen(b.address);
    expect(source.size).toBe(1);
    leaveA();
    expect(source.size).toBe(1);
    leaveB();
    expect(source.size).toBe(0);

    // Listening again starts from the Snapshot drawn now.
    listen(b.address);
    expect(draw(at(list([a, row('b', { bumps: 1 }), c], header)))).toEqual([
      b.address,
    ]);
  });

  it('is the same subscribe while anything listens at the Address', () => {
    const { drawn } = drawing(start);
    const first = drawn.subscribeAt(a.address);
    const leave = first(() => {});
    expect(drawn.subscribeAt(a.address)).toBe(first);
    leave();
  });
});
