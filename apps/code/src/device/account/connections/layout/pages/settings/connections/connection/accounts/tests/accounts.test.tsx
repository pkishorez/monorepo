// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import {
  CodeClient,
  CodeClients,
  HarnessAccountInfo,
  InvalidAccount,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Setup,
  type SetupChange,
  Connections,
} from '../../../../../../../connections.ts';
import { keys } from '../../../../../../commands.ts';
import { Links } from '../../../../../../../connection/link/index.ts';
import { HarnessAccountsLive } from '../actor.ts';
import { HarnessAccountsView } from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * One Connection's agent accounts, drawn from what its Connection's setup holds,
 * under each agent: a row per account, saying why one does not run, which
 * opens its card under it and closes it again, one at a time, on touch
 * too; another login added from its agent's +, with its config folder,
 * saved as typed and told to the setup, or dropped on Cancel; a refusal kept
 * on its card; an added account removed once asked again, a Default
 * Account never. A skeleton while the setup knows nothing; why the Connection
 * could not be asked, and Retry, which asks the setup again. While its Link
 * is not linked, the rows show as kept and take no tap, and none is
 * added.
 */

const Owner = Actor.define('Owner', {
  requires: [Connections],
  model: Schema.Struct({
    pings: Schema.Finite,
    accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    SetupShown: {
      accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
      problem: Schema.NullOr(Schema.String),
    },
  }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0, accounts: null, problem: null } }),
  workers: {
    setup: {
      run: (self) =>
        Effect.flatMap(Connections, ({ setup }) =>
          Stream.runForEach(setup('m1'), (shown) =>
            self.send({
              _tag: 'SetupShown',
              accounts: shown?.accounts ?? null,
              problem: shown?.problem ?? null,
            }),
          ),
        ),
    },
  },
  children: (child) => ({
    accounts: child(HarnessAccountsLive, {
      input: () => ({ connectionId: 'm1' }),
      props: ({ model }) => ({
        accounts: model.accounts,
        problem: model.problem,
      }),
    }),
  }),
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    SetupShown: ({ accounts, problem }, { model }) => ({
      model: { ...model, accounts, problem },
    }),
  },
});

let pings = 0;
let ping = () => {};
let link: 'linked' | 'relinking' = 'linked';

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Links value={{ connections: null, status: { m1: link }, checked: true }}>
        <HarnessAccountsView instance={children.accounts} />
      </Links>
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
    // Connect runs with a folder of its own for Claude Code.
    resolvedConfigFolder: {
      path: '/Users/me/.claude-work',
      from: 'environment',
      variable: 'CLAUDE_CONFIG_DIR',
    },
    isDefault: true,
    resolved: resolved('/usr/local/bin/claude'),
  },
  {
    id: 'codex',
    harness: 'codex',
    name: 'Codex',
    binaryPath: null,
    configFolder: null,
    resolvedConfigFolder: { path: '/Users/me/.codex', from: 'default' },
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
/** What the setup was told and asked. */
let told: Array<SetupChange> = [];
let refreshes = 0;
/** The Connection's setup, as the test says it. */
let setup: SubscriptionRef.SubscriptionRef<Setup | null>;

const setupOf = (
  accounts: ReadonlyArray<HarnessAccountInfo> | null,
  problem: string | null = null,
): Setup => ({
  accounts,
  speech: null,
  harnesses: null,
  models: [],
  savedRead: true,
  problem,
});

/** The setup as the stand-in keeps it: a change shows at once. */
const changedBy = (now: Setup | null, change: SetupChange): Setup => {
  const accounts = now?.accounts ?? [];
  return setupOf(
    change._tag === 'AccountRemoved'
      ? accounts.filter(({ id }) => id !== change.id)
      : accounts.some(({ id }) => id === change.account.id)
        ? accounts.map((each) =>
            each.id === change.account.id ? change.account : each,
          )
        : [...accounts, change.account],
  );
};

const connections = () =>
  Layer.mock(Connections)({
    setup: () => SubscriptionRef.changes(setup),
    changed: (_, change) =>
      Effect.andThen(
        Effect.sync(() => void told.push(change)),
        SubscriptionRef.update(setup, (now) => changedBy(now, change)),
      ),
    refresh: () => Effect.sync(() => void refreshes++),
  });

const clients = CodeClients.make(() =>
  Layer.merge(
    // An RPC client's procedures are generic over how they are called;
    // a stand-in answers the one way the app calls them.
    Layer.mock(CodeClient)({
      saveHarnessAccount: ((input: Saved) =>
        refuse !== null
          ? Effect.fail(new InvalidAccount({ message: refuse }))
          : Effect.sync(() => {
              saved.push(input);
              return {
                ...input,
                id: input.id ?? `${input.harness}-work`,
                resolvedConfigFolder: {
                  path: input.configFolder ?? '/Users/me/.claude',
                  from: input.configFolder === null ? 'default' : 'account',
                },
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

/** The setup says the Connection's accounts. */
const answers = async (
  accounts: ReadonlyArray<HarnessAccountInfo> | null,
  problem: string | null = null,
) => {
  await act(
    async () =>
      void Effect.runSync(
        SubscriptionRef.set(setup, setupOf(accounts, problem)),
      ),
  );
  for (let tries = 0; tries < 10; tries++) await flush();
};

const mount = async () => {
  const services = Layer.mergeAll(connections(), clients);
  const App = View.app(OwnerView, {
    layer: services,
    name: `accounts-test-${apps++}`,
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
  link = 'linked';
  told = [];
  refreshes = 0;
  setup = Effect.runSync(SubscriptionRef.make<Setup | null>(null));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Harness Accounts, as the setup holds them', () => {
  it('shows a skeleton while the setup knows nothing, then its accounts', async () => {
    await mount();
    expect(busy()).toBe(true);
    await answers(DEFAULTS);
    expect(busy()).toBe(false);
    expect(names()).toEqual(['Claude', 'Codex']);
  });

  it('says why the Connection could not be asked, and asks the setup again on Retry', async () => {
    await mount();
    await answers(null, 'The Connection could not be reached');
    expect(text()).toContain('The Connection could not be reached');
    await click(button('Try again'));
    expect(refreshes).toBe(1);
  });

  it("shows what was kept, taking no tap, while the Connection's Link is not linked", async () => {
    link = 'relinking';
    await mount();
    await answers(DEFAULTS);
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
    // An empty folder is the one it really runs with, and the row says it,
    // and that Connect's environment set it, with the version that runs;
    // an empty binary, the one on PATH, which the form says.
    expect(labelled('Claude').textContent).toContain(
      '~/.claude-work· from environment',
    );
    expect(labelled('Claude').textContent).toContain('1.0.0');
    expect(labelled('Codex').textContent).toContain('~/.codex');
    expect(labelled('Codex').textContent).not.toContain('environment');
    // A Default Account is never removed.
    await click(labelled('Claude'));
    expect(text()).toContain('now /usr/local/bin/claude');
    // What an empty folder means is the folder it really uses.
    expect(field('claude-config-folder')?.value).toBe('');
    expect(text()).toContain(
      "CLAUDE_CONFIG_DIR · empty = ~/.claude-work, from Connect's environment",
    );
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
    expect(told.map(({ _tag }) => _tag)).toEqual(['AccountSaved']);
  });

  it('keeps what was typed, and why the Connection refused it', async () => {
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
    expect(told.at(-1)).toEqual({ _tag: 'AccountRemoved', id: 'codex-work' });
    expect(text()).not.toContain('Codex work');
  });
});
