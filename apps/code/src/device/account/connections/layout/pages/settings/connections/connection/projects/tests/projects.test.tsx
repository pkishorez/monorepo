// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
import {
  CodeClient,
  CodeClients,
  type Project,
  type Session,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Store as MemoryStore } from '@kestack/std-toolkit/replica/memory';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Cache,
  type Gone,
  SavedDrafts,
  Seen,
  Sync,
} from '../../../../../../../connection/store/index.ts';
import { Connections } from '../../../../../../../connections.ts';
import { Storage } from '../../../../../../../../store/index.ts';
import { keys } from '../../../../../../commands.ts';
import { Links } from '../../../../../../../connection/link/index.ts';
import { ConnectionProjectsLive, type Row, rowsOf } from '../actor.ts';
import { ConnectionProjectsView } from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Connection's Projects in Settings: each with whether its folder is there
 * and its path's end, the most recently active first; Remove asks first,
 * then its Connection removes it, this device forgets what it kept of it,
 * and once it is gone from the list the question closes.
 */

const project = (id: string, at: Partial<Project> = {}): Project => ({
  id,
  name: id,
  path: `/home/me/${id}`,
  createdAt: 1,
  folder: 'present',
  ...at,
});

const session = (projectId: string, at: Partial<Session>): Session => ({
  id: `s-${projectId}`,
  projectId,
  harness: 'claude',
  account: 'claude',
  model: 'opus',
  settings: {},
  title: 'Hi',
  status: 'idle',
  nativeId: null,
  createdAt: 1,
  forkedFrom: null,
  settledAt: null,
  activeAt: 1,
  endedAt: null,
  ...at,
});

describe('a Connection’s Projects, as listed', () => {
  it('puts the most recently active first, by a Turn started or ended, else when added', () => {
    const rows = rowsOf(
      [
        project('old', { createdAt: 5 }),
        project('ended'),
        project('gone', { createdAt: 20, folder: 'missing' }),
      ],
      [session('ended', { activeAt: 10, endedAt: 30 })],
    );
    expect(
      rows.map(({ id, activeAt, missing }) => [id, activeAt, missing]),
    ).toEqual([
      ['ended', 30, false],
      ['gone', 20, true],
      ['old', 5, false],
    ]);
  });
});

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    projects: {
      actor: ConnectionProjectsLive,
      input: () => ({ connectionId: 'm1' }),
    },
  },
  on: { Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }) },
});

let pings = 0;
let ping = () => {};
let read: (rows: ReadonlyArray<Row>) => void = () => {};

/** Hands the list its rows, as its Worker would. */
const Reader = View.make(ConnectionProjectsLive, ({ send }) => {
  read = (rows) => send({ _tag: 'Read', rows });
  return null;
});

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Links
        value={{ connections: null, status: { m1: 'linked' }, checked: true }}
      >
        <Reader instance={children.projects} />
        <ConnectionProjectsView instance={children.projects} />
      </Links>
    </keys.Provider>
  );
});

const ROWS: ReadonlyArray<Row> = [
  {
    id: 'p1',
    name: 'site',
    path: '/Users/me/code/site',
    missing: false,
    activeAt: Date.now(),
  },
  {
    id: 'p2',
    name: 'notes',
    path: '/Users/me/notes',
    missing: true,
    activeAt: Date.now() - 3_600_000,
  },
];

let removed: Array<string> = [];
let dropped: Array<Gone> = [];

const drops = {
  drop: (gone: Gone) => Effect.sync(() => void dropped.push(gone)),
};

const services = Layer.mergeAll(
  CodeClients.make(() =>
    Layer.merge(
      Layer.mock(CodeClient)({
        removeProject: ({ id }: { readonly id: string }) =>
          Effect.sync(() => void removed.push(id)),
      }),
      Layer.mock(RpcConnection)({
        keepSubscribed: (subscribe) => subscribe(),
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  ),
  // Rows are handed over by `read`, never held from a Replica.
  Layer.mock(Replicas)({ hold: () => Effect.never }),
  Layer.mock(Connections)({ account: Effect.succeed('a1') }),
  Layer.mock(Sync)({ ...drops, store: () => MemoryStore.memory() }),
  Layer.mock(Seen)(drops),
  Layer.mock(Cache)(drops),
  Layer.mock(SavedDrafts)(drops),
  Layer.mock(Storage)({}),
);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const settle = async () => {
  for (let tries = 0; tries < 10; tries++) await flush();
};
const text = () => document.body.textContent ?? '';
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (each) =>
      each.getAttribute('aria-label') === name || each.textContent === name,
  );

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  removed = [];
  dropped = [];
  pings = 0;
  const App = toReact(OwnerLive, OwnerView, services, {
    name: `connection-projects-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  await act(async () => read(ROWS));
  await settle();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('a Connection’s Projects in Settings', () => {
  it('lists each with whether its folder is there, its path’s end and when it was last active', () => {
    const rows = [...document.querySelectorAll('li')].map(
      (each) => each.textContent ?? '',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('site');
    expect(rows[0]).toContain('Active');
    expect(rows[0]).toContain('~/code/site');
    expect(rows[1]).toContain('notes');
    expect(rows[1]).toContain('Folder missing');
    expect(rows[1]).toContain('1 hour ago');
  });

  it('removes one once asked, forgetting what this device kept of it', async () => {
    await act(async () => button('notes')!.click());
    await settle();
    await act(async () => button('Remove project…')!.click());
    await settle();
    expect(text()).toContain('Remove notes?');
    expect(removed).toEqual([]);
    await act(async () => button('Remove project')!.click());
    await settle();
    expect(removed).toEqual(['p2']);
    expect(dropped).toHaveLength(4);
    expect(dropped[0]).toMatchObject({
      _tag: 'Project',
      accountId: 'a1',
      connectionId: 'm1',
      projectId: 'p2',
    });
    await act(async () => read([ROWS[0]!]));
    await settle();
    expect(text()).not.toContain('Remove notes?');
    expect(document.querySelectorAll('li')).toHaveLength(1);
  });
});
