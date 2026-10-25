// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
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
import { Machines } from '../../../../../layer/capabilities/index.ts';
import { keys } from '../../../../../keys.ts';
import { HarnessAccountsLive } from './actor.ts';
import { HarnessAccountsView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * One Machine's agent accounts, drawn from what the Machine says: a card
 * per account, saying why one does not run; another login added with its
 * config folder, saved as typed; a refusal kept on its card; an added
 * account removed once asked again, a Default Account never.
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
      input: () => ({ machineId: 'm1' }),
    },
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
      <HarnessAccountsView instance={children.accounts} />
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
    home: null,
    isDefault: true,
    resolved: resolved('/usr/local/bin/claude'),
  },
  {
    id: 'codex',
    harness: 'codex',
    name: 'Codex',
    binaryPath: null,
    home: null,
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

const clients = CodeClients.make(() =>
  Layer.merge(
    // An RPC client's procedures are generic over how they are called;
    // a stand-in answers the one way the app calls them.
    Layer.mock(CodeClient)({
      harnessAccounts: (() =>
        Effect.succeed(DEFAULTS)) as unknown as Api['harnessAccounts'],
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

const services = Layer.merge(Layer.mock(Machines)({}), clients);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const text = () => document.body.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(
    (each) => each.textContent === label,
  )!;
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

beforeEach(async () => {
  saved = [];
  removed = [];
  refuse = null;
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
  for (let tries = 0; tries < 50 && !text().includes('Codex'); tries++)
    await flush();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Harness Accounts', () => {
  it('draws a card per account, saying how to install an agent that is not there', () => {
    const names = [...document.querySelectorAll('h3')].map(
      (each) => each.textContent,
    );
    expect(names).toEqual(['Agents', 'Claude', 'Codex']);
    expect(text()).toContain('npm install -g @openai/codex');
    // A Default Account is never removed.
    expect(button('Remove…')).toBeUndefined();
  });

  it('adds another login with its config folder, saved as typed', async () => {
    await click(button('Add a Claude account'));
    await type(field('new-name-field'), ' Claude work ');
    await type(field('new-home'), '~/.claude-work');
    await click(button('Add account'));
    expect(saved).toEqual([
      {
        id: null,
        harness: 'claude',
        name: 'Claude work',
        binaryPath: null,
        home: '~/.claude-work',
      },
    ]);
    expect(
      [...document.querySelectorAll('h3')].map((each) => each.textContent),
    ).toEqual(['Agents', 'Claude', 'Codex', 'Claude work']);
  });

  it('keeps what was typed, and why the Machine refused it', async () => {
    refuse = 'Nothing is at /nowhere; sign in with that config folder first';
    await click(button('Add a Claude account'));
    await type(field('new-name-field'), 'Claude work');
    await type(field('new-home'), '/nowhere');
    await click(button('Add account'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'sign in with that config folder first',
    );
    expect(field('new-home').value).toBe('/nowhere');
  });

  it('removes an added account once asked again', async () => {
    await click(button('Add a Codex account'));
    await type(field('new-name-field'), 'Codex work');
    await click(button('Add account'));
    await click(button('Remove…'));
    expect(removed).toEqual([]);
    expect(text()).toContain('Its sessions stop working.');
    await click(button('Remove'));
    expect(removed).toEqual(['codex-work']);
    expect(text()).not.toContain('Codex work');
  });
});
