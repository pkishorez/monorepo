// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import {
  CodeClient,
  CodeClients,
  type HarnessAccountInfo,
  type Machine as MachineSchema,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { Navigation } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Kit,
  type Known,
  Machines,
  nobody,
} from '../../../../layer/capabilities/index.ts';
import { keys } from '../../../../keys.ts';
import { Connection } from '../../../machines/index.ts';
import { MachineSettingsLive } from './actor.ts';
import { MachineSettingsView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Settings → Machines draws once: nothing while the list kept on this
 * device, or any listed Machine's Kit, is still being read, and then every
 * card whole, with what its Kit holds, no skeleton. With nothing kept at
 * all, a skeleton until Cloud Connect answers.
 */

type Machine = typeof MachineSchema.Type;

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    page: { actor: MachineSettingsLive },
  },
  on: { Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }) },
});

let pings = 0;
let ping = () => {};

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Connection value={{ machines: null, status: { m1: 'connected' } }}>
        <MachineSettingsView instance={children.page} />
      </Connection>
    </keys.Provider>
  );
});

const M1: Machine = {
  id: 'm1',
  name: 'Studio',
  key: 'key-m1',
  version: '0.0.4',
  status: { _tag: 'Reachable', url: 'https://m1.trycloudflare.com', at: 0 },
  lastSeen: Date.now(),
};

const CLAUDE: HarnessAccountInfo = {
  id: 'claude',
  harness: 'claude',
  name: 'Claude',
  binaryPath: null,
  configFolder: null,
  isDefault: true,
  resolved: {
    path: '/usr/local/bin/claude',
    version: '1.0.0',
    error: null,
    isDefault: true,
  },
};

let known: SubscriptionRef.SubscriptionRef<Known>;

const kit = (parts: Partial<Kit>): Kit => ({
  accounts: null,
  speech: null,
  harnesses: null,
  models: [],
  savedRead: true,
  problem: null,
  ...parts,
});

const machines = () =>
  Layer.mock(Machines)({
    state: Stream.unwrap(Effect.sync(() => SubscriptionRef.changes(known))),
  });

const clients = CodeClients.make(() =>
  Layer.merge(
    Layer.mock(CodeClient)({}),
    Layer.mock(RpcConnection)({
      keepSubscribed: (subscribe) => subscribe(),
      hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
    }),
  ),
);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const settle = async () => {
  for (let tries = 0; tries < 10; tries++) await flush();
};
const text = () => document.body.textContent ?? '';
const cards = () => document.querySelectorAll('li').length;
const busy = () => document.querySelector('[aria-busy]') !== null;

const tell = async (now: Partial<Known>) => {
  await act(async () =>
    Effect.runSync(
      SubscriptionRef.update(known, (before) => ({ ...before, ...now })),
    ),
  );
  await settle();
};

const mount = async () => {
  const App = toReact(
    OwnerLive,
    OwnerView,
    Layer.mergeAll(machines(), clients, Layer.mock(Navigation)({})),
    { name: `machine-settings-test-${apps++}` },
  );
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(pings).toBeGreaterThan(0);
  await settle();
};

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  pings = 0;
  known = Effect.runSync(SubscriptionRef.make<Known>(nobody));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Settings → Machines, drawn once', () => {
  it('draws nothing until the kept list and every Kit are read, then every card whole', async () => {
    await mount();
    await tell({ accountId: 'a1' });
    expect(cards()).toBe(0);
    // The list kept here is read; its Machine's Kit is not yet.
    await tell({
      savedRead: true,
      machines: [M1],
      kits: { m1: kit({ savedRead: false }) },
    });
    expect(cards()).toBe(0);
    expect(busy()).toBe(false);
    expect(text()).not.toContain('Studio');
    await tell({
      kits: { m1: kit({ accounts: [CLAUDE], speech: { _tag: 'Ready' } }) },
    });
    expect(cards()).toBe(1);
    expect(text()).toContain('Studio');
    expect(text()).toContain('Claude');
    expect(text()).toContain('Ready');
    expect(busy()).toBe(false);
  });

  it('shows a skeleton when nothing was ever kept, until Cloud Connect answers', async () => {
    await mount();
    await tell({ accountId: 'a1', savedRead: true });
    expect(cards()).toBe(0);
    expect(busy()).toBe(true);
    await tell({ machines: [M1], fetchedAt: 1, kits: { m1: kit({}) } });
    expect(cards()).toBe(1);
  });

  it('shows a change its Kit holds without drawing the card anew', async () => {
    await mount();
    await tell({
      accountId: 'a1',
      savedRead: true,
      machines: [M1],
      kits: { m1: kit({ accounts: [CLAUDE] }) },
    });
    const card = document.querySelector('li');
    await tell({
      kits: {
        m1: kit({
          accounts: [
            CLAUDE,
            { ...CLAUDE, id: 'qa', name: 'QA kit', isDefault: false },
          ],
        }),
      },
    });
    expect(document.querySelector('li')).toBe(card);
    expect(text()).toContain('QA kit');
  });
});
