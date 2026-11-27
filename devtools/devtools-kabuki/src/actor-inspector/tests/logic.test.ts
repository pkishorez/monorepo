import { describe, expect, it } from 'vitest';
import type { DataOf } from '@kestack/kabuki/types';
import {
  awayFromHead,
  boardOf,
  foldOf,
  jsonDiff,
  nextOf,
  timelineOf,
  traceOf,
} from '../logic/shared/index.ts';
import type {
  Card,
  Change,
  InspectorShape,
  Node,
  Played,
} from '../logic/shared/index.ts';

type Data = DataOf<typeof InspectorShape>;

const node = (
  address: string,
  workers: Node['workers'] = [],
  children: Array<Node> = [],
): Node => ({
  address,
  actor: 'A',
  slot: address.includes('/') ? 'item' : null,
  state: 'Shut',
  data: { count: 2, fresh: true },
  model: { title: 'b', other: 1 },
  workers,
  provides: [],
  children,
});

const message: Played = {
  id: 7,
  to: 'App',
  tag: 'Closed',
  message: { _tag: 'Closed' },
  from: { kind: 'worker', instance: 'App', name: 'poll' },
  at: 7,
  outcome: 'handled',
  commands: [],
  emits: [],
};

const changes: ReadonlyArray<Change> = [
  {
    _tag: 'Changed',
    address: 'App',
    actor: 'A',
    state: {
      before: { _tag: 'Open', count: 1, gone: 'x' },
      after: { _tag: 'Shut', count: 2, fresh: true },
      transition: true,
    },
    model: { title: { before: 'a', after: 'b' }, gone: { before: 1 } },
    props: {},
    workers: { started: [{ name: 'tick' }], stopped: [{ name: 'poll' }] },
  },
  {
    _tag: 'Removed',
    address: 'App/item[k]#1',
    actor: 'A',
    key: 'k',
    state: { _tag: 'Open' },
    model: {},
    workers: [],
  },
];

const dataOf = (
  removed: boolean,
  tree: Node = node('App', [
    { name: 'tick', within: 'state', runs: 'each', key: 'x' },
  ]),
  played: Played = message,
): Data =>
  ({
    model: {
      presenting: false,
      place: 'bottom',
      now: null,
      entries: [],
      branch: null,
      shown: 7,
      stepped: {
        at: 7,
        tree,
        message: played,
        changes,
      },
      previewing: false,
      removed,
      opened: null,
      playing: false,
      problem: null,
    },
  }) as unknown as Data;

const kinds = (fields: Card['model']) =>
  fields.map(({ key, kind }) => `${key}:${kind}`);

describe('boardOf', () => {
  it('shows every field, marks what the Step changed, and hides what it removed', () => {
    const board = boardOf(dataOf(false))!;
    const { root } = board;
    expect(root.was).toBe('Open');
    expect(kinds(root.model)).toEqual(['title:changed', 'other:same']);
    expect(root.model[0]).toMatchObject({ before: 'a', value: 'b' });
    expect(kinds(root.data)).toEqual(['count:same', 'fresh:same']);
    expect(root.children).toHaveLength(0);
    expect(root.stateWorkers).toEqual([
      {
        name: 'tick',
        runs: 'each',
        mark: null,
        sending: false,
        keys: [{ key: 'x', mark: null }],
      },
    ]);
    expect(root.workers).toEqual([
      { name: 'poll', mark: 'stopped', sending: true, keys: [] },
    ]);
    expect(root.target).toBe(true);
    expect(board.sender).toBeNull();
  });

  it('puts removed Instances and fields back when asked', () => {
    const { root } = boardOf(dataOf(true))!;
    expect(kinds(root.model)).toContain('gone:removed');
    expect(
      root.children.map(({ name, ghost, node }) => [name, ghost, node.key]),
    ).toEqual([['item', true, 'k']]);
  });

  it('names the card that sent the Message to another one', () => {
    const left = 'App/item[a]#1';
    const right = 'App/item[b]#2';
    const tree = node('App', [], [node(left), node(right)]);
    const played: Played = {
      ...message,
      to: right,
      from: { kind: 'emit', instance: left, name: 'Moved' },
    };
    const board = boardOf(dataOf(false, tree, played))!;
    expect(board.sender).toBe(left);
    expect(board.root.children.map(({ sent }) => sent)).toEqual([
      'Closed',
      null,
    ]);
  });
});

describe('traceOf', () => {
  const child = 'App/item[a]#1';
  const entry = (
    id: number,
    to: string,
    tag: string,
    from: Played['from'],
  ) => ({
    id,
    parent: id - 1,
    to,
    tag,
    from,
    at: id,
    outcome: 'handled' as const,
    changed: true,
  });

  it('walks an Emit back to the Message its Child took, and on to where that came from', () => {
    const played: Played = {
      ...message,
      id: 12,
      to: 'App',
      tag: 'Toggled',
      from: { kind: 'emit', instance: child, name: 'Toggled' },
    };
    const data = dataOf(false, node('App', [], [node(child)]), played);
    const entries = [
      entry(10, 'App', 'Added', { kind: 'view', instance: 'App' }),
      entry(11, child, 'Toggled', { kind: 'view', instance: child }),
      entry(12, 'App', 'Toggled', played.from),
    ];
    const trace = traceOf({
      ...data,
      model: { ...data.model, entries },
    } as unknown as Data)!;
    expect(trace.chain.map(({ id, tag, shown }) => [id, tag, shown])).toEqual([
      [11, 'Toggled', false],
      [12, 'Toggled', true],
    ]);
    expect(trace.chain[0]!.from.kind).toBe('view');
  });

  it('lists what the Step changed, Instance by Instance', () => {
    const trace = traceOf(dataOf(true))!;
    expect(
      trace.effects.map(
        ({ instance, path, kind }) => `${instance} ${path} ${kind}`,
      ),
    ).toEqual([
      'App state changed',
      'App model.title changed',
      'App model.gone removed',
      'App/item[k]#1  removed',
    ]);
  });
});

describe('timelineOf', () => {
  it('greys a Step that changed nothing', () => {
    const data = {
      model: {
        ...dataOf(false).model,
        now: {
          head: 2,
          previewing: null,
          running: true,
          failure: null,
          url: '',
          revision: 1,
        },
        entries: [
          {
            id: 1,
            parent: null,
            to: 'App',
            tag: 'A',
            from: { kind: 'outside' },
            at: 1,
            outcome: 'handled',
            changed: true,
          },
          {
            id: 2,
            parent: 1,
            to: 'App',
            tag: 'B',
            from: { kind: 'outside' },
            at: 2,
            outcome: 'handled',
            changed: false,
          },
        ],
        shown: null,
      },
    } as unknown as Data;
    expect(timelineOf(data).ticks.map(({ tone }) => tone)).toEqual([
      'took',
      'ignored',
    ]);
  });
});

describe('nextOf', () => {
  const entry = (id: number, parent: number | null) => ({
    id,
    parent,
    to: 'App',
    tag: 'A',
    from: { kind: 'outside' },
    at: id,
    outcome: 'handled',
    changed: true,
  });
  const at = (branch: number | null): Data =>
    ({
      model: {
        ...dataOf(false).model,
        now: {
          head: 2,
          previewing: null,
          running: true,
          failure: null,
          url: '',
          revision: 1,
        },
        entries: [entry(1, null), entry(2, 1), entry(3, 1)],
        shown: 1,
        branch,
      },
    }) as unknown as Data;

  it('plays to the last Step of another Branch, and stops there', () => {
    expect(nextOf(at(3))).toBe(3);
    expect(awayFromHead(at(3))).toBe(true);
  });

  it("goes back to the Head at the end of the Head's Branch", () => {
    expect(nextOf(at(null))).toBeNull();
    expect(awayFromHead(at(null))).toBe(false);
  });
});

describe('jsonDiff', () => {
  it('keeps the lines both sides share and marks only what changed', () => {
    const [hunk] = jsonDiff(['a', 'b'], ['a', 'b', 'c']).hunks;
    expect(
      hunk!.lines.map(({ kind, content }) => `${kind} ${content}`),
    ).toEqual([
      'context [',
      'context   "a",',
      'removed   "b"',
      'added   "b",',
      'added   "c"',
      'context ]',
    ]);
  });
});

describe('foldOf', () => {
  const many = node(
    'App',
    [],
    Array.from({ length: 20 }, (_, index) => node(`App/item[${index}]#1`)),
  );
  const board = boardOf(dataOf(false, many))!;
  const names = (folded: ReturnType<typeof foldOf>) =>
    folded.children.map(({ card }) => card.node.address);

  it('shows the first few of many children and folds the rest behind a picker', () => {
    const folded = foldOf(board.root, new Set(), new Set());
    expect(names(folded)).toHaveLength(5);
    expect(folded.more).toMatchObject({ total: 20, open: false });
    expect(folded.more!.hidden).toHaveLength(15);
  });

  it('keeps a picked child, and shows them all when opened', () => {
    const picked = foldOf(board.root, new Set(['App/item[12]#1']), new Set());
    expect(names(picked)).toContain('App/item[12]#1');
    const open = foldOf(board.root, new Set(), new Set(['App']));
    expect(names(open)).toHaveLength(20);
    expect(open.more).toMatchObject({ open: true, hidden: [] });
  });
});
