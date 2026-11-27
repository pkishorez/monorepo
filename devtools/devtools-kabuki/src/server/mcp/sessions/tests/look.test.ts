import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  Looked,
  Stepped,
  Work,
} from '../../../rpc/session/contract/index.ts';
import { failuresOf, lookOf } from '../real/look.ts';
import { nameOf } from '../real/names.ts';
import { settle } from '../real/settle.ts';
import { TUNNEL, root } from './history.ts';

const work: Work = {
  instances: {
    [TUNNEL]: {
      workers: [
        {
          name: 'reachability',
          key: '',
          status: 'failed',
          failure: 'Error: boom\n    at reach (tunnel.ts:12:3)',
          since: 1200,
        },
        { name: 'sync', key: 'a', status: 'waiting', since: 0 },
        { name: 'heartbeat', key: '', status: 'running', since: 0 },
      ],
      commands: [{ name: 'saveUrl', args: { url: 'x' }, since: 3000 }],
      provides: [],
    },
  },
  failures: [
    {
      address: TUNNEL,
      kind: 'worker',
      name: 'reachability',
      failure: 'Error: boom',
      at: 1200,
    },
    {
      address: 'Connect/old#1',
      kind: 'command',
      name: 'fetch',
      failure: 'Timeout',
      at: 900,
    },
  ],
  settled: false,
};

const models = {
  Connect: {
    email: 'ada@x.io',
    notes: Array.from({ length: 30 }, (_, at) => ({ at, text: `note ${at}` })),
  },
  [TUNNEL]: { url: 'https://t.example.com', reachable: true },
  'Connect/plugin#1': {},
};

const stepped = (more: Partial<Stepped> = {}): Stepped => ({
  at: 15,
  tree: root,
  message: null,
  changes: [],
  work,
  ...more,
});

describe('lookOf', () => {
  it('puts the problems at the head first, then the tree with a short Model each', () => {
    expect(
      lookOf({ stepped: stepped(), models, opened: [] }, nameOf(root)),
    ).toBe(
      [
        'at 15 (head), not settled',
        'problems:',
        '  Tunnel: worker reachability failed @1.2s: Error: boom',
        '  Tunnel: worker sync[a] waiting for its Capabilities',
        '  Tunnel: command saveUrl running since @3.0s { url: x }',
        '  Connect/old#1: command fetch failed @0.9s: Timeout',
        'Connect [SignedIn]  { email: ada@x.io, notes: […30] }',
        '  Tunnel [Active]  { url: https://t.example.com, reachable: true }',
        '  Plugin [Running]',
        '… cut: open: [name] gives the whole Model and the Messages it takes',
      ].join('\n'),
    );
  });

  it('says a past step has no Work report', () => {
    const { work: _, ...past } = stepped({ at: 3 });
    expect(
      lookOf({ stepped: past, models: {}, opened: [] }, nameOf(root)).split(
        '\n',
      ),
    ).toEqual([
      'at 3 (a past step: no Work report)',
      'Connect [SignedIn]',
      '  Tunnel [Active]',
      '  Plugin [Running]',
    ]);
  });

  it('shows an opened Instance whole instead of the tree, with the Messages it takes', () => {
    const [, sync, heartbeat] = work.instances[TUNNEL]!.workers;
    const tunnel: Looked = {
      at: 15,
      address: TUNNEL,
      actor: 'Tunnel',
      description: 'A public URL to this machine',
      slot: 'tunnel',
      state: 'Active',
      states: ['Opening', 'Active'],
      data: { _tag: 'Active', since: 5 },
      model: models[TUNNEL],
      workers: [
        { name: 'sync', key: 'a', within: 'state', live: sync! },
        { name: 'heartbeat', within: 'always', live: heartbeat! },
        { name: 'probe', within: 'state' },
      ],
      provides: [],
      takes: [
        {
          tag: 'Closed',
          description: 'The tunnel was closed',
          payload: { kind: 'struct', fields: [] },
          within: 'state',
        },
        {
          tag: 'Pinged',
          payload: { kind: 'struct', fields: [] },
          within: 'always',
        },
        {
          tag: 'Renamed',
          description: 'The tunnel has a new name',
          payload: {
            kind: 'struct',
            fields: [
              {
                name: 'name',
                optional: false,
                nullable: false,
                shape: { kind: 'text' },
              },
            ],
          },
          within: 'always',
        },
      ],
    };
    expect(
      lookOf(
        {
          stepped: stepped({
            work: { instances: {}, failures: [], settled: true },
          }),
          models: {},
          opened: [tunnel],
        },
        nameOf(root),
      ),
    ).toBe(
      [
        'at 15 (head), settled',
        'Tunnel [Active]',
        '  about: A public URL to this machine',
        '  data: { since: 5 }',
        '  model: { url: https://t.example.com, reachable: true }',
        '  workers: sync[a] waiting, heartbeat running, probe',
        '  takes:',
        '    Renamed { name: string }  // The tunnel has a new name',
        '    Closed {}  // The tunnel was closed',
        '    +1 internal',
      ].join('\n'),
    );
  });
});

const PATIENCE = { quiet: 20, most: 200, every: 5 };

const reads = (looks: ReadonlyArray<Partial<Work> & { changed?: number }>) => {
  let at = 0;
  return Effect.sync(() => {
    const { changed = null, ...one } = looks[Math.min(at, looks.length - 1)]!;
    at += 1;
    return {
      stepped: stepped({
        work: { ...work, failures: [], settled: true, ...one },
      }),
      changed,
    };
  });
};

describe('settle', () => {
  it('waits until the app is Settled and nothing has changed for a quiet moment', async () => {
    const settling = await Effect.runPromise(
      settle(
        reads([{ settled: false }, { settled: false }, { changed: 1 }]),
        new Set(),
        PATIENCE,
      ),
    );
    expect(settling.settled).toBe(true);
    expect(settling.waited).toBeGreaterThanOrEqual(20);
  });

  it('stops at once on a new failure', async () => {
    const failed = work.failures[1]!;
    const settling = await Effect.runPromise(
      settle(
        reads([
          { settled: false },
          { settled: false, failures: work.failures },
        ]),
        failuresOf({ ...work, failures: [work.failures[0]!] }),
        PATIENCE,
      ),
    );
    expect(settling).toMatchObject({ settled: false, failed: [failed] });
  });

  it('gives up after the longest wait', async () => {
    const settling = await Effect.runPromise(
      settle(reads([{ settled: false }]), new Set(), PATIENCE),
    );
    expect(settling.settled).toBe(false);
    expect(settling.waited).toBeGreaterThanOrEqual(200);
  });

  it('starts its quiet moment over each time a Step changes something', async () => {
    let changed = 0;
    const busy = Effect.sync(() => ({
      stepped: stepped({ work: { ...work, failures: [], settled: true } }),
      changed: (changed += 1),
    }));
    const settling = await Effect.runPromise(settle(busy, new Set(), PATIENCE));
    expect(settling.settled).toBe(false);
  });
});
