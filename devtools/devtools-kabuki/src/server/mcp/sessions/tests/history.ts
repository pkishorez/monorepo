import type {
  Change,
  Entry,
  Node,
  Now,
} from '../../../rpc/session/contract/index.ts';
import type { Detail } from '../real/details.ts';

export const node = (
  address: string,
  actor: string,
  state: string,
  children: ReadonlyArray<Node> = [],
): Node => ({
  address,
  actor,
  slot: null,
  state,
  data: {},
  model: {},
  workers: [],
  provides: [],
  children,
});

export const TUNNEL = 'Connect/tunnel#1';

export const root = node('Connect', 'Connect', 'SignedIn', [
  node(TUNNEL, 'Tunnel', 'Active'),
  node('Connect/plugin#1', 'Plugin', 'Running'),
]);

const changed = (
  address: string,
  actor: string,
  more: Partial<Extract<Change, { _tag: 'Changed' }>>,
): Change => ({
  _tag: 'Changed',
  address,
  actor,
  model: {},
  props: {},
  workers: { started: [], stopped: [] },
  ...more,
});

export const historyOf = () => {
  let id = 0;
  const details = new Map<number, Detail>();
  const entry = ({
    message = { _tag: 'TunnelReachable', reachable: true },
    changes = [],
    commands = [],
    ...more
  }: Partial<Entry & Detail>): Entry => {
    id += 1;
    details.set(id, { message, changes, commands });
    return {
      id,
      parent: id === 1 ? null : id - 1,
      to: TUNNEL,
      tag: 'TunnelReachable',
      from: { kind: 'worker', instance: TUNNEL, name: 'reachability' },
      at: id * 1000,
      outcome: 'handled',
      changed: changes.length > 0,
      ...more,
    };
  };
  const line: ReadonlyArray<Entry> = [
    entry({
      to: 'Connect',
      tag: 'SignIn',
      message: { _tag: 'SignIn', email: 'ada@x.io' },
      from: { kind: 'view', instance: 'Connect' },
      changes: [
        changed('Connect', 'Connect', {
          state: {
            before: { _tag: 'SignedOut' },
            after: { _tag: 'SignedIn', user: 'ada' },
            transition: true,
          },
          model: { email: { before: null, after: 'ada@x.io' } },
          workers: { started: [{ name: 'session' }], stopped: [] },
        }),
        {
          _tag: 'Added',
          address: TUNNEL,
          actor: 'Tunnel',
          state: { _tag: 'Opening' },
          model: { url: null, reachable: false },
          workers: [{ name: 'reachability' }],
        },
        {
          _tag: 'Added',
          address: `${TUNNEL}/probe#1`,
          actor: 'Probe',
          state: { _tag: 'Single' },
          model: {},
          workers: [],
        },
      ],
    }),
    entry({
      tag: 'Opened',
      message: { _tag: 'Opened', url: 'https://t.example.com' },
      from: { kind: 'command', instance: TUNNEL, name: 'open' },
      changes: [
        changed(TUNNEL, 'Tunnel', {
          state: {
            before: { _tag: 'Opening' },
            after: { _tag: 'Active' },
            transition: true,
          },
          model: { url: { before: null, after: 'https://t.example.com' } },
        }),
      ],
    }),
    entry({
      to: 'Connect',
      tag: 'TunnelUp',
      message: { _tag: 'TunnelUp', url: 'https://t.example.com' },
      from: { kind: 'emit', instance: TUNNEL, name: 'Up' },
      changes: [
        changed('Connect', 'Connect', {
          model: {
            notes: {
              before: [],
              after: Array.from({ length: 8 }, (_, at) => ({
                at,
                text: `note ${at}`,
              })),
            },
          },
        }),
      ],
    }),
    ...Array.from({ length: 9 }, () => entry({})),
    entry({ tag: 'Nope', outcome: 'ignored' }),
    entry({}),
    entry({}),
  ];
  const now: Now = {
    head: id,
    previewing: null,
    running: true,
    failure: null,
    url: '',
    revision: 1,
  };
  return { line, now, details };
};
