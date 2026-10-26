// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Deferred, Effect, Layer, Schema } from 'effect';
import {
  CodeClient,
  CodeClients,
  InvalidAccount,
  type HarnessAccountInfo,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Machines,
  SavedMachines,
} from '../../../../../layer/capabilities/index.ts';
import { savedMachinesMemory } from '../../../../../layer/services/index.ts';
import { keys } from '../../../../../keys.ts';
import { Connection } from '../../../../machines/index.ts';
import { HarnessAccountsLive } from './actor.ts';
import { HarnessAccountsView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * One Machine's agent accounts, drawn from what the Machine says, under
 * each agent: a row per account, saying why one does not run, which opens
 * its card under it and closes it again, one at a time, on touch too;
 * another login added from its agent's +, with its config
 * folder, saved as typed, or dropped on Cancel; a refusal kept on its
 * card; an added account removed once asked again, a Default Account
 * never. Kept on this device per Account: what was kept shows at once,
 * with no skeleton, and the Machine's answer, and each change, is kept;
 * kept nowhere, a skeleton shows until it answers. A change made while it
 * is asked asks again, so an older answer never undoes it. While its Line is not
 * connected, the rows show as kept and take no tap, and none is added.
 */

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    accounts: {
      actor: HarnessAccountsLive,
      input: () => ({ machineId: 'm1', accountId: 'a1', kept: handed }),
    },
  },
  on: { Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }) },
});

let pings = 0;
let ping = () => {};
let line: 'connected' | 'reconnecting' = 'connected';

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Connection value={{ machines: null, status: { m1: line } }}>
        <HarnessAccountsView instance={children.accounts} />
      </Connection>
    </keys.Provider>
  );
});

type Api = CodeClient['Service'];
type Saved = Parameters<Api['saveHarnessAccount']>[0];

const resolved = (path: string, error: string | null = null) => ({
  path,
  version: error === null ? '1.0.0' : null,
  error,
  isDefault: true,
});

const DEFAULTS: ReadonlyArray<HarnessAccountInfo> = [
  {
    id: 'claude',
    harness: 'claude',
    name: 'Claude',
    binaryPath: null,
    configFolder: null,
    isDefault: true,
    resolved: resolved('/usr/local/bin/claude'),
  },
  {
    id: 'codex',
    harness: 'codex',
    name: 'Codex',
    binaryPath: null,
    configFolder: null,
    isDefault: true,
    resolved: resolved(
      'codex',
      'Codex is not installed: install it with `npm install -g @openai/codex`, then run `codex login`',
    ),
  },
];

let saved: Array<Saved> = [];
let removed: Array<string> = [];
let refuse: string | null = null;
/** What the Machine answers, once the test says. */
let answer: Deferred.Deferred<ReadonlyArray<HarnessAccountInfo>>;
let kept: Layer.Layer<SavedMachines>;
/** What this device kept, handed in as it opens. */
let handed: ReadonlyArray<HarnessAccountInfo> | null = null;

const clients = CodeClients.make(() =>
  Layer.merge(
    // An RPC client's procedures are generic over how they are called;
    // a stand-in answers the one way the app calls them.
    Layer.mock(CodeClient)({
      harnessAccounts: (() =>
        Deferred.await(answer)) as unknown as Api['harnessAccounts'],
      saveHarnessAccount: ((input: Saved) =>
        refuse !== null
          ? Effect.fail(new InvalidAccount({ message: refuse }))
          : Effect.sync(() => {
              saved.push(input);
              return {
                ...input,
                id: input.id ?? `${input.harness}-work`,
                isDefault: false,
                resolved: resolved('/usr/local/bin/claude'),
              };
            })) as unknown as Api['saveHarnessAccount'],
      removeHarnessAccount: (({ id }: { id: string }) =>
        Effect.sync(
          () => void removed.push(id),
        )) as unknown as Api['removeHarnessAccount'],
    }),
    Layer.mock(RpcConnection)({
      keepSubscribed: (subscribe) => subscribe(),
      hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
    }),
  ),
);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const text = () => document.body.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(
    (each) => each.textContent === label,
  )!;
const labelled = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const names = () =>
  [...document.querySelectorAll('[data-slot="account-name"]')].map(
    (each) => each.textContent,
  );
const expanded = (label: string) =>
  labelled(label).getAttribute('aria-expanded');
const field = (id: string) =>
  document.querySelector<HTMLInputElement>(`#account-m1-${id}`)!;

const click = async (element: HTMLElement) => {
  await act(async () => element.click());
  await flush();
};

/** Types into a React-controlled input. */
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};

/** Makes the device a touch screen with no keyboard, or one driven by keys, as `useDevice` hears it. */
const driven = async (by: 'touch' | 'keys') => {
  await act(async () => {
    if (by === 'touch') {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      Object.assign(event, { pointerType: 'touch' });
      window.dispatchEvent(event);
    } else
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
  });
  await flush();
};

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

const busy = () => document.querySelector('[aria-busy]') !== null;

const answers = async (accounts: ReadonlyArray<HarnessAccountInfo>) => {
  await act(
    async () => void Effect.runSync(Deferred.succeed(answer, accounts)),
  );
  for (let tries = 0; tries < 50 && !text().includes('Codex'); tries++)
    await flush();
  await flush();
};

/** What is kept on this device of the Machine's accounts. */
const keptAccounts = () =>
  Effect.runPromise(
    Effect.flatMap(SavedMachines, (each) => each.settings('a1', 'm1')).pipe(
      Effect.map(({ accounts }) => accounts),
      Effect.provide(kept),
    ),
  );

const keep = (accounts: ReadonlyArray<HarnessAccountInfo>) => {
  handed = accounts;
};

const mount = async () => {
  const services = Layer.mergeAll(Layer.mock(Machines)({}), clients, kept);
  const App = toReact(OwnerLive, OwnerView, services, {
    name: `harness-accounts-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(pings).toBeGreaterThan(0);
  await flush();
};

beforeEach(() => {
  saved = [];
  removed = [];
  refuse = null;
  pings = 0;
  line = 'connected';
  answer = Effect.runSync(Deferred.make<ReadonlyArray<HarnessAccountInfo>>());
  kept = savedMachinesMemory();
  handed = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Harness Accounts, kept on this device', () => {
  it('shows a skeleton until the Machine answers when nothing was kept, then keeps its answer', async () => {
    await mount();
    expect(busy()).toBe(true);
    await answers(DEFAULTS);
    expect(busy()).toBe(false);
    expect(names()).toEqual(['Claude', 'Codex']);
    expect(await keptAccounts()).toEqual(DEFAULTS);
  });

  it('shows what was kept at once, with no skeleton, then the Machine’s answer', async () => {
    keep([{ ...DEFAULTS[0]!, name: 'Claude home' }]);
    await mount();
    expect(busy()).toBe(false);
    expect(names()).toEqual(['Claude home']);
    await answers(DEFAULTS);
    expect(names()).toEqual(['Claude', 'Codex']);
  });

  it('asks again when an account is removed while the Machine is asked, so the older answer never brings it back', async () => {
    const work: HarnessAccountInfo = {
      ...DEFAULTS[1]!,
      id: 'codex-work',
      name: 'Codex work',
      isDefault: false,
    };
    keep([...DEFAULTS, work]);
    await mount();
    const older = answer;
    answer = Effect.runSync(Deferred.make<ReadonlyArray<HarnessAccountInfo>>());
    await click(labelled('Codex work'));
    await click(button('Remove…'));
    await click(button('Remove'));
    expect(removed).toEqual(['codex-work']);
    await act(
      async () =>
        void Effect.runSync(Deferred.succeed(older, [...DEFAULTS, work])),
    );
    await flush();
    expect(names()).toEqual(['Claude', 'Codex']);
    expect((await keptAccounts())?.map(({ id }) => id)).toEqual([
      'claude',
      'codex',
    ]);
    await answers(DEFAULTS);
    expect(names()).toEqual(['Claude', 'Codex']);
  });

  it("shows what was kept, taking no tap, while the Machine's Line is not connected", async () => {
    keep(DEFAULTS);
    line = 'reconnecting';
    await mount();
    expect(names()).toEqual(['Claude', 'Codex']);
    expect(labelled('Claude').hasAttribute('disabled')).toBe(true);
    expect(labelled('Add Claude account').hasAttribute('disabled')).toBe(true);
    expect(text()).not.toContain('Locked');
  });
});

describe('Harness Accounts on touch with no keyboard', () => {
  beforeEach(async () => {
    await mount();
    await driven('touch');
    await answers(DEFAULTS);
  });

  it('opens a row’s card under it, as with keys, and the account being added under its own row', async () => {
    expect(expanded('Claude')).toBe('false');
    await click(labelled('Claude'));
    expect(expanded('Claude')).toBe('true');
    expect(field('claude-name-field').value).toBe('Claude');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(labelled('Claude'));
    expect(field('claude-name-field')).toBeNull();
    await click(labelled('Add Claude account'));
    expect(expanded('New Claude account')).toBe('true');
    expect(field('new-claude-name-field')).not.toBeNull();
  });
});

describe('Harness Accounts', () => {
  beforeEach(async () => {
    await mount();
    await driven('keys');
    await answers(DEFAULTS);
  });

  it('opens a row’s card under it, closes it on a second tap, and keeps one open at a time', async () => {
    expect(expanded('Claude')).toBe('false');
    await click(labelled('Claude'));
    expect(expanded('Claude')).toBe('true');
    expect(field('claude-name-field').value).toBe('Claude');
    await click(labelled('Claude'));
    expect(expanded('Claude')).toBe('false');
    expect(field('claude-name-field')).toBeNull();
    await click(labelled('Claude'));
    await click(labelled('Codex'));
    expect(expanded('Claude')).toBe('false');
    expect(expanded('Codex')).toBe('true');
    expect(field('claude-name-field')).toBeNull();
  });

  it('adds an account for the agent whose + was tapped, under that agent', async () => {
    await click(labelled('Add Codex account'));
    expect(expanded('New Codex account')).toBe('true');
    expect(field('new-codex-name-field')).not.toBeNull();
    expect(field('new-claude-name-field')).toBeNull();
    expect(
      labelled('New Codex account').closest('section')?.textContent,
    ).toContain('Codex');
    // Another row opened drops the account being added.
    await click(labelled('Claude'));
    expect(field('new-codex-name-field')).toBeNull();
    expect(labelled('New Codex account')).toBeNull();
  });

  it('draws a row per account, saying how to install an agent that is not there', async () => {
    expect(names()).toEqual(['Claude', 'Codex']);
    expect(text()).toContain('npm install -g @openai/codex');
    // An empty folder is the agent's own, and the row says it, with the
    // version that runs; an empty binary, the one on PATH, which the form says.
    expect(labelled('Claude').textContent).toContain('~/.claude');
    expect(labelled('Claude').textContent).toContain('1.0.0');
    // A Default Account is never removed.
    await click(labelled('Claude'));
    expect(text()).toContain('now /usr/local/bin/claude');
    expect(button('Remove…')).toBeUndefined();
  });

  it('adds another login with its config folder, saved as typed', async () => {
    await click(labelled('Add Claude account'));
    await type(field('new-claude-name-field'), ' Claude work ');
    await type(field('new-claude-config-folder'), '~/.claude-work');
    await click(button('Add account'));
    expect(saved).toEqual([
      {
        id: null,
        harness: 'claude',
        name: 'Claude work',
        binaryPath: null,
        configFolder: '~/.claude-work',
      },
    ]);
    // Under its agent, after the Default Account, its folder and the variable it sets.
    expect(names()).toEqual(['Claude', 'Claude work', 'Codex']);
    expect(labelled('Claude work').textContent).toContain('~/.claude-work');
    expect((await keptAccounts())?.map(({ name }) => name)).toEqual([
      'Claude',
      'Codex',
      'Claude work',
    ]);
  });

  it('keeps what was typed, and why the Machine refused it', async () => {
    refuse = 'Nothing is at /nowhere; sign in with that config folder first';
    await click(labelled('Add Claude account'));
    await type(field('new-claude-name-field'), 'Claude work');
    await type(field('new-claude-config-folder'), '/nowhere');
    await click(button('Add account'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'sign in with that config folder first',
    );
    expect(field('new-claude-config-folder').value).toBe('/nowhere');
  });

  it('drops the account being added on Cancel', async () => {
    await click(labelled('Add Claude account'));
    await type(field('new-claude-name-field'), 'Claude work');
    await click(button('Cancel'));
    expect(saved).toEqual([]);
    expect(field('new-claude-name-field')).toBeNull();
    expect(labelled('Add Claude account')).not.toBeNull();
  });

  it('closes a form on Cancel, dropping what was typed', async () => {
    await click(labelled('Claude'));
    await type(field('claude-name-field'), 'Claude home');
    await click(button('Cancel'));
    expect(field('claude-name-field')).toBeNull();
    await click(labelled('Claude'));
    expect(field('claude-name-field').value).toBe('Claude');
  });

  it('removes an added account once asked again', async () => {
    await click(labelled('Add Codex account'));
    await type(field('new-codex-name-field'), 'Codex work');
    await click(button('Add account'));
    await click(labelled('Codex work'));
    await click(button('Remove…'));
    expect(removed).toEqual([]);
    expect(text()).toContain('Its sessions stop working.');
    await click(button('Remove'));
    expect(removed).toEqual(['codex-work']);
    expect(text()).not.toContain('Codex work');
  });
});
