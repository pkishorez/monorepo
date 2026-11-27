import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../rpc/session/contract/index.ts';
import { chainsOf } from '../real/chains.ts';
import { changesOf } from '../real/details.ts';
import { type Held, branchOf, heldWith, lineThrough } from '../real/held.ts';
import { nameOf } from '../real/names.ts';
import { chainOf, stepOf } from '../real/step.ts';
import { timelineOf } from '../real/timeline.ts';
import { TUNNEL, historyOf, root } from './history.ts';

const { line, now, details } = historyOf();
const name = nameOf(root, changesOf(details));
const ids = (entries: ReadonlyArray<Entry>) => entries.map(({ id }) => id);

describe('chainsOf', () => {
  it('reads a Chain as an entry not Emitted and every Emit right after it', () => {
    const chains = chainsOf(line);
    expect(chains.slice(0, 3).map(({ entries }) => ids(entries))).toEqual([
      [1],
      [2, 3],
      [4],
    ]);
    expect(chains).toHaveLength(14);
  });

  it('says a Chain is cut when its start was Compacted away', () => {
    const [first] = chainsOf(line.slice(2));
    expect(first).toMatchObject({ cut: true });
    expect(ids(first!.entries)).toEqual([3]);
  });
});

describe('timelineOf', () => {
  it('lists Chains newest first, folding repeats that changed nothing', () => {
    expect(timelineOf(now, line, {}, name, details).drawn).toBe(
      [
        'head 15 · 14 Chains, newest first; id → kabuki_step',
        '14–15  worker reachability  TunnelReachable → Tunnel ×2  · no change',
        '13  worker reachability  Nope → Tunnel [ignored]  · no change',
        '4–12  worker reachability  TunnelReachable → Tunnel ×9  · no change',
        '2  command open  Opened → Tunnel → Connect: TunnelUp  · State Opening→Active, model url; Connect: model notes',
        '1  view  SignIn → Connect  · State SignedOut→SignedIn, model email, worker session started; +Tunnel (+1 under)',
      ].join('\n'),
    );
  });

  it('keeps only the Chains asked for: by Instance, by tag, changed or not handled', () => {
    const lines = (filter: Parameters<typeof timelineOf>[2]) =>
      timelineOf(now, line, filter, name, details).drawn.split('\n').slice(1);
    expect(lines({ only: 'changed' }).map((one) => one.split(' ')[0])).toEqual([
      '2',
      '1',
    ]);
    expect(lines({ only: 'unhandled' })).toEqual([
      '13  worker reachability  Nope → Tunnel [ignored]  · no change',
    ]);
    expect(lines({ tag: 'tunnelup' }).map((one) => one.split(' ')[0])).toEqual([
      '2',
    ]);
    expect(
      lines({ instance: 'Connect' }).map((one) => one.split(' ')[0]),
    ).toEqual(['2', '1']);
    expect(lines({ tag: 'Missing' })).toEqual(['no Chain matches']);
  });

  it('pages by id, saying where the older ones start', () => {
    const first = timelineOf(
      now,
      line,
      { lines: 2 },
      name,
      details,
    ).drawn.split('\n');
    expect(first.at(-1)).toBe('11 older: before: 13');
    const next = timelineOf(
      now,
      line,
      { before: 13, lines: 1 },
      name,
      details,
    ).drawn;
    expect(next.split('\n')[1]).toMatch(/^4–12 /);
  });

  it('asks for the Steps of only the Chains it shows, and folds no repeat that ran a Command', () => {
    const { wanted } = timelineOf(now, line, { lines: 2 }, name, new Map());
    expect([...new Set(wanted)].sort((one, other) => one - other)).toEqual([
      13, 15,
    ]);
    const ran = new Map(details);
    ran.set(15, { ...details.get(15)!, commands: [{ name: 'ping' }] });
    expect(
      timelineOf(now, line, { lines: 2 }, name, ran).drawn.split('\n').slice(1),
    ).toEqual([
      '15  worker reachability  TunnelReachable → Tunnel  · command ping',
      '14  worker reachability  TunnelReachable → Tunnel  · no change',
      '12 older: before: 14',
    ]);
  });

  it('says where the app is when it is not at its head', () => {
    expect(
      timelineOf(
        { ...now, previewing: 3, failure: 'boom' },
        line,
        {},
        name,
        details,
      ).drawn.split('\n')[0],
    ).toBe(
      'head 15 · showing step 3 (kabuki_travel to: null comes back) · app failed: boom · 14 Chains, newest first; id → kabuki_step',
    );
  });
});

describe('stepOf', () => {
  it('prints a whole Chain: each Message, who sent it, and only what changed, before → after', () => {
    expect(stepOf(chainOf(chainsOf(line), 3)!, name, details).drawn).toBe(
      [
        'Chain 2–3 @2.0s, 2 Steps',
        '2  Opened → Tunnel  from command open · handled',
        '  message: { url: https://t.example.com }',
        '  Tunnel:',
        '    State Opening → Active',
        '    url: null → https://t.example.com',
        '3  TunnelUp → Connect  from emit Up of Tunnel · handled',
        '  message: { url: https://t.example.com }',
        '  Connect:',
        '    notes: 0 → 8 items',
        '      + { at: 0, text: note 0 }',
        '      + { at: 1, text: note 1 }',
        '      + { at: 2, text: note 2 }',
        '      + { at: 3, text: note 3 }',
        '      + { at: 4, text: note 4 }',
        '      + … 3 more',
      ].join('\n'),
    );
  });

  it('prints an Instance added with its data and Workers, and a State with its data', () => {
    expect(stepOf(chainOf(chainsOf(line), 1)!, name, details).drawn).toBe(
      [
        'Chain 1 @1.0s, 1 Step',
        '1  SignIn → Connect  from view · handled',
        '  message: { email: ada@x.io }',
        '  Connect:',
        '    State SignedOut → SignedIn',
        '      data: { user: ada }',
        '    email: null → ada@x.io',
        '    started worker session',
        '  +Tunnel [Opening]',
        '    model: { url: null, reachable: false }',
        '    workers: reachability',
        '  +Probe',
      ].join('\n'),
    );
  });
});

describe('the History held for a Kabuki Session', () => {
  const batch = (entries: ReadonlyArray<Entry>, epoch = 'one') => ({
    now,
    epoch,
    entries,
    roots: [entries[0]?.id ?? 1],
  });

  it('grows by the entries after its cursor, and starts over in a new epoch', () => {
    const first = heldWith(undefined, batch(line.slice(0, 5)));
    const grown = heldWith(first, { ...batch(line.slice(5)), roots: [1] });
    expect(grown.entries.size).toBe(15);
    expect(grown.newest).toBe(15);
    const again = heldWith(grown, batch(line.slice(10), 'two'));
    expect([...again.entries.keys()]).toEqual([11, 12, 13, 14, 15]);
  });

  it('reads the Branch back from the head, and the line through any entry, Emits after it included', () => {
    const held: Held = heldWith(undefined, {
      ...batch(line),
      now: { ...now, head: 6 },
    });
    expect(ids(branchOf(held))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(lineThrough(held, 2))).toEqual([1, 2, 3]);
    expect(lineThrough(held, 99)).toEqual([]);
  });
});

it('names an Instance gone from the tree by its Actor and key', () => {
  expect(name(TUNNEL)).toBe('Tunnel');
  expect(name(`${TUNNEL}/probe#1`)).toBe('Probe');
  expect(name('Elsewhere/x#1')).toBe('Elsewhere/x#1');
});
