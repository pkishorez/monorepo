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
 * One Machine's agent accounts, drawn from what the Machine says: a card
 * per account, saying why one does not run; another login added with its
 * config folder, saved as typed, or dropped on Cancel; a refusal kept on
 * its card; an added account removed once asked again, a Default Account
 * never. Kept on this device per Account: what was kept shows at once,
 * with no skeleton, and the Machine's answer, and each change, is kept;
 * kept nowhere, a skeleton shows until it answers. A change made while it
 * is asked asks again, so an older answer never undoes it. While its Line is not
 * connected, the cards show as kept, locked, saying why.
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
      input: () => ({ machineId: 'm1', accountId: 'a1' }),
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
  [...document.querySelectorAll('h5')].map((each) => each.textContent);
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

beforeAll(() => {
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

const keep = (accounts: ReadonlyArray<HarnessAccountInfo>) =>
  Effect.runPromise(
    Effect.flatMap(SavedMachines, (each) =>
      each.keepSettings('a1', 'm1', { accounts }),
    ).pipe(Effect.provide(kept)),
  );

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
    await keep([{ ...DEFAULTS[0]!, name: 'Claude home' }]);
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
    await keep([...DEFAULTS, work]);
    await mount();
    const older = answer;
    answer = Effect.runSync(Deferred.make<ReadonlyArray<HarnessAccountInfo>>());
    await click(labelled('Change Codex work'));
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

  it("shows what was kept, locked, while the Machine's Line is not connected", async () => {
    await keep(DEFAULTS);
    line = 'reconnecting';
    await mount();
    expect(names()).toEqual(['Claude', 'Codex']);
    expect(labelled('Change Claude')).toBeNull();
    expect(labelled('Add a Claude account')).toBeNull();
    expect(document.querySelector('[role="note"]')?.textContent).toContain(
      'Locked',
    );
  });
});

describe('Harness Accounts', () => {
  beforeEach(async () => {
    await mount();
    await answers(DEFAULTS);
  });

  it('draws a row per account, saying how to install an agent that is not there', async () => {
    expect(names()).toEqual(['Claude', 'Codex']);
    expect(text()).toContain('npm install -g @openai/codex');
    // An empty folder is the agent's own; an empty binary, the one on PATH.
    expect(text()).toContain('~/.claude · its own');
    expect(text()).toContain('/usr/local/bin/claude · from PATH');
    // A Default Account is never removed.
    await click(labelled('Change Claude'));
    expect(button('Remove…')).toBeUndefined();
  });

  it('adds another login with its config folder, saved as typed', async () => {
    await click(labelled('Add a Claude account'));
    await type(field('new-name-field'), ' Claude work ');
    await type(field('new-config-folder'), '~/.claude-work');
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
    expect(text()).toContain('~/.claude-work · CLAUDE_CONFIG_DIR');
    expect((await keptAccounts())?.map(({ name }) => name)).toEqual([
      'Claude',
      'Codex',
      'Claude work',
    ]);
  });

  it('keeps what was typed, and why the Machine refused it', async () => {
    refuse = 'Nothing is at /nowhere; sign in with that config folder first';
    await click(labelled('Add a Claude account'));
    await type(field('new-name-field'), 'Claude work');
    await type(field('new-config-folder'), '/nowhere');
    await click(button('Add account'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'sign in with that config folder first',
    );
    expect(field('new-config-folder').value).toBe('/nowhere');
  });

  it('drops the account being added on Cancel', async () => {
    await click(labelled('Add a Claude account'));
    await type(field('new-name-field'), 'Claude work');
    await click(button('Cancel'));
    expect(saved).toEqual([]);
    expect(field('new-name-field')).toBeNull();
    expect(labelled('Add a Claude account')).not.toBeNull();
  });

  it('closes a form on Cancel, dropping what was typed', async () => {
    await click(labelled('Change Claude'));
    await type(field('claude-name-field'), 'Claude home');
    await click(button('Cancel'));
    expect(field('claude-name-field')).toBeNull();
    await click(labelled('Change Claude'));
    expect(field('claude-name-field').value).toBe('Claude');
  });

  it('removes an added account once asked again', async () => {
    await click(labelled('Add a Codex account'));
    await type(field('new-name-field'), 'Codex work');
    await click(button('Add account'));
    await click(labelled('Change Codex work'));
    await click(button('Remove…'));
    expect(removed).toEqual([]);
    expect(text()).toContain('Its sessions stop working.');
    await click(button('Remove'));
    expect(removed).toEqual(['codex-work']);
    expect(text()).not.toContain('Codex work');
  });
});
