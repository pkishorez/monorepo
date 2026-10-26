// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import {
  CodeClient,
  CodeClients,
  type HarnessAccountInfo,
  type Connection as ConnectionSchema,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { Navigation } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Store as MemoryStore } from '@kestack/std-toolkit/replica/memory';
import { GestureProvider, useDevice } from '@kestack/web-platform/ui/input';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Cache,
  SavedDrafts,
  Seen,
  Sync,
} from '../../../../../connection/store/index.ts';
import {
  type Known,
  Connections,
  nobody,
  type Setup,
} from '../../../../../connections.ts';
import { Storage } from '../../../../../../store/index.ts';
import { keys } from '../../../../commands.ts';
import { Links } from '../../../../../connection/link/index.ts';
import { ConnectionSettingsLive } from '../actor.ts';
import { ConnectionSettingsView } from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Settings → Connections draws once: nothing while the list kept on this
 * device, or any listed Connection's setup, is still being read, and then every
 * card whole, with what its setup holds, no skeleton. With nothing kept at
 * all, a skeleton until Cloud Connect answers. Forget sits beside each
 * Connection's name, a bin that asks first. On touch a sideways swipe
 * anywhere on the card moves its Agents and Projects, which are at least
 * half the screen tall there, and only there.
 */

type Connection = typeof ConnectionSchema.Type;

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    page: { actor: ConnectionSettingsLive },
  },
  on: { Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }) },
});

let pings = 0;
let ping = () => {};

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  // The app hears the device from the start, as its Layout does, so a touch
  // before any card is drawn still counts.
  useDevice();
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <GestureProvider>
        <Links
          value={{ connections: null, status: { m1: 'linked' }, checked: true }}
        >
          <ConnectionSettingsView instance={children.page} />
        </Links>
      </GestureProvider>
    </keys.Provider>
  );
});

const M1: Connection = {
  id: 'm1',
  name: 'Studio',
  key: 'key-m1',
  version: '0.0.4',
  status: { _tag: 'Reachable', url: 'https://m1.trycloudflare.com', at: 0 },
  lastSeen: Date.now(),
  plugins: {},
  wanted: {},
};

const CLAUDE: HarnessAccountInfo = {
  id: 'claude',
  harness: 'claude',
  name: 'Claude',
  binaryPath: null,
  configFolder: null,
  resolvedConfigFolder: { path: '/Users/me/.claude', from: 'default' },
  isDefault: true,
  resolved: {
    path: '/usr/local/bin/claude',
    version: '1.0.0',
    error: null,
    isDefault: true,
  },
};

let known: SubscriptionRef.SubscriptionRef<Known>;
let forgot: Array<string>;

const setup = (parts: Partial<Setup>): Setup => ({
  accounts: null,
  speech: null,
  harnesses: null,
  models: [],
  savedRead: true,
  problem: null,
  ...parts,
});

const connections = () =>
  Layer.mock(Connections)({
    state: Stream.unwrap(Effect.sync(() => SubscriptionRef.changes(known))),
    forget: (id: string) => Effect.sync(() => void forgot.push(id)),
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
    Layer.mergeAll(
      connections(),
      clients,
      Layer.mock(Navigation)({}),
      // A Connection's Projects are never read here: see projects/.
      Layer.mock(Replicas)({ hold: () => Effect.never }),
      Layer.mock(Sync)({ store: () => MemoryStore.memory() }),
      Layer.mock(Seen)({}),
      Layer.mock(Cache)({}),
      Layer.mock(SavedDrafts)({}),
      Layer.mock(Storage)({}),
    ),
    { name: `connection-settings-test-${apps++}` },
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

/** Makes the device a touch screen, as `useDevice` hears it. */
const touched = async () => {
  await act(async () => {
    const event = new MouseEvent('pointerdown', { bubbles: true });
    Object.assign(event, { pointerType: 'touch' });
    window.dispatchEvent(event);
  });
  await flush();
};

/** One finger on `at`, moved `dx` sideways, then lifted. */
const swipe = async (at: Element, dx: number) => {
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: 200,
      button: 0,
    });
    Object.assign(event, { pointerId: 1, pointerType: 'touch' });
    at.dispatchEvent(event);
  };
  await act(async () => pointer('pointerdown', 200));
  for (let step = 1; step <= 10; step += 1)
    await act(async () => pointer('pointermove', 200 + (dx * step) / 10));
  await act(async () => pointer('pointerup', 200 + dx));
  await settle();
};

const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (each) => each.textContent === name,
  )!;

/** The tab panel open, the one that takes a touch. */
const panelOpen = () =>
  document.querySelector<HTMLElement>('[role="tabpanel"]:not([inert] *)')!;

const shown = () =>
  tell({
    accountId: 'a1',
    savedRead: true,
    connections: [M1],
    setups: { m1: setup({ accounts: [CLAUDE], speech: { _tag: 'Ready' } }) },
  });

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  pings = 0;
  forgot = [];
  known = Effect.runSync(SubscriptionRef.make<Known>(nobody));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Settings → Connections, drawn once', () => {
  it('draws nothing until the kept list and every setup are read, then every card whole', async () => {
    await mount();
    await tell({ accountId: 'a1' });
    expect(cards()).toBe(0);
    // The list kept here is read; its Connection's setup is not yet.
    await tell({
      savedRead: true,
      connections: [M1],
      setups: { m1: setup({ savedRead: false }) },
    });
    expect(cards()).toBe(0);
    expect(busy()).toBe(false);
    expect(text()).not.toContain('Studio');
    await tell({
      setups: { m1: setup({ accounts: [CLAUDE], speech: { _tag: 'Ready' } }) },
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
    await tell({ connections: [M1], fetchedAt: 1, setups: { m1: setup({}) } });
    expect(cards()).toBe(1);
  });

  it('shows a change its setup holds without drawing the card anew', async () => {
    await mount();
    await tell({
      accountId: 'a1',
      savedRead: true,
      connections: [M1],
      setups: { m1: setup({ accounts: [CLAUDE] }) },
    });
    const card = document.querySelector('li');
    await tell({
      setups: {
        m1: setup({
          accounts: [
            CLAUDE,
            { ...CLAUDE, id: 'qa', name: 'QA setup', isDefault: false },
          ],
        }),
      },
    });
    expect(document.querySelector('li')).toBe(card);
    expect(text()).toContain('QA setup');
  });
});

describe('Settings → Connections, Agents or Projects', () => {
  it('shows a Connection’s Agents, then its Projects as chosen, each Connection on its own', async () => {
    await mount();
    await shown();
    expect(tab('Agents').getAttribute('aria-selected')).toBe('true');
    // Drawn as Settings' own tabs are, each naming the panel it opens.
    for (const name of ['Agents', 'Projects'])
      expect(tab(name).dataset['slot']).toBe('tab');
    expect(
      document
        .getElementById(tab('Agents').getAttribute('aria-controls')!)
        ?.getAttribute('role'),
    ).toBe('tabpanel');
    expect(text()).toContain('Claude');
    await act(async () => tab('Projects').click());
    await settle();
    expect(tab('Projects').getAttribute('aria-selected')).toBe('true');
    expect(text()).not.toContain('Claude');
    expect(busy()).toBe(true);
  });
});

describe('Settings → Connections, Forget', () => {
  it('sits beside the Connection’s name, asks first, and forgets once confirmed', async () => {
    await mount();
    await shown();
    const forget = document.querySelector<HTMLElement>(
      '[aria-label="Forget Studio"]',
    )!;
    expect(forget.closest('li')?.textContent).not.toContain('Forget this');
    expect(forget.parentElement?.querySelector('h3')?.textContent).toBe(
      'Studio',
    );
    await act(async () => forget.click());
    await settle();
    expect(text()).toContain('Forget Studio?');
    expect(forgot).toEqual([]);
    const confirm = [...document.querySelectorAll<HTMLElement>('button')].find(
      (each) => each.textContent === 'Forget',
    )!;
    await act(async () => confirm.click());
    await settle();
    expect(forgot).toEqual(['m1']);
  });
});

// Before any touch: this device then stays a touch screen.
describe('Settings → Connections on a screen never touched', () => {
  it('keeps its tabs as tall as what they hold', async () => {
    await mount();
    await shown();
    expect(panelOpen().className).not.toContain('min-h-');
  });
});

describe('Settings → Connections on touch', () => {
  beforeEach(async () => {
    await mount();
    await touched();
    await shown();
  });

  it('moves a Connection’s tabs on a swipe from the foot of the card, or its name', async () => {
    const card = document.querySelector('li')!;
    // The card is the swipe's zone, whole, Forget and all.
    expect(card.children).toHaveLength(1);
    expect(card.firstElementChild?.contains(panelOpen())).toBe(true);
    await swipe(panelOpen(), -150);
    expect(tab('Projects').getAttribute('aria-selected')).toBe('true');
    await swipe(card.querySelector('h3')!, 150);
    expect(tab('Agents').getAttribute('aria-selected')).toBe('true');
  });

  it('gives each tab at least half the screen, so there is room to swipe', () => {
    for (const panel of document.querySelectorAll('[role="tabpanel"]'))
      expect(panel.className).toContain('min-h-[50dvh]');
  });
});
