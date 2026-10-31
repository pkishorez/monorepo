// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Navigation } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../commands.ts';
import { session } from '../../../../../../routes/index.ts';
import { Moves } from '../../../../connection/records/index.ts';
import * as Picker from '../../../../../../../ui/controls/picker/index.ts';
import { ActionsLive, ListView } from '../actor.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Actions opened by keys from the sidebar, on a Fork. Going to
 * the original goes on to the page, as the app does; Settling it stays,
 * so the keyboard goes back to the sidebar. The server is never reached:
 * the Session is handed over, Settling succeeds, and moving the app is
 * only heard.
 */

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: (child) => ({
    actions: child(ActionsLive, {
      props: () => ({ bindings: {} }),
    }),
  }),
  on: {
    Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }),
  },
});

let pushed: Array<unknown> = [];
let settled: Array<string> = [];
let pings = 0;
let ping = () => {};
let active = '';
let read = () => {};

/** Actions as the header draws them, opened by `a` on `s2`. */
const Actions = View.make(ActionsLive, ({ model, children, send }) => {
  const open = Picker.useOpen();
  keys.useAction('app.actions', () =>
    open(() =>
      send({
        _tag: 'Open',
        how: 'keys',
        at: { connectionId: 'm1', sessionId: 's2' },
        available: [],
        vim: true,
        keyboard: true,
      }),
    ),
  );
  read = () =>
    send({
      _tag: 'Read',
      session: {
        id: 's2',
        projectId: 'p1',
        running: false,
        settled: false,
        original: { id: 's1', title: 'First' },
      },
    });
  return (
    <Picker.Frame how={model.picking} mode="drawer" label="Session actions">
      {children.picker && <ListView instance={children.picker} />}
    </Picker.Frame>
  );
});

function Places() {
  active = keys.useKeyboard().active;
  const row = keys.useFocusSpot('sidebar', 'row', { default: true });
  const composer = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <>
      <keys.Surface id="sidebar">
        <button type="button" ref={row}>
          A row
        </button>
      </keys.Surface>
      <keys.Surface id="content">
        <div ref={composer} tabIndex={0} data-testid="editor" />
      </keys.Surface>
    </>
  );
}

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Places />
      <Actions instance={children.actions} />
    </keys.Provider>
  );
});

const services = Layer.mergeAll(
  // A Settle goes through Moves, which only notes it.
  Layer.succeed(
    Moves,
    Moves.of({
      intents: Stream.never,
      refusals: Stream.never,
      put: ({ sessionId }, to) =>
        Effect.sync(() => void (to && settled.push(sessionId))),
      agreed: () => Effect.void,
    }),
  ),
  CodeClients.make(() =>
    Layer.merge(
      Layer.mock(CodeClient)({}),
      Layer.mock(RpcConnection)({
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  ),
  // The Session is handed over by `read`, never held from a Replica.
  Layer.mock(Replicas)({ hold: () => Effect.never }),
  Layer.mock(Navigation)({
    push: (to) => Effect.sync(() => void pushed.push(to)),
  }),
);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const editor = () =>
  document.querySelector<HTMLElement>('[data-testid="editor"]')!;
const row = () =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (each) => each.textContent === 'A row',
  )!;
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');

const key = async (name: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code: name.length === 1 ? `Key${name.toUpperCase()}` : name,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, bubbles: true, ...init }),
    );
  });
  await flush();
};

const openFromSidebar = async () => {
  await act(async () => {
    row().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    row().focus();
  });
  await flush();
  expect(active).toBe('sidebar');
  await key('a');
  await act(async () => read());
  await flush();
  expect(document.activeElement).toBe(search());
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  pushed = [];
  settled = [];
  const App = View.app(OwnerView, {
    layer: services,
    name: `actions-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(pings).toBeGreaterThan(0);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Actions on a session', () => {
  it('go on to the page with the original, opened from the sidebar', async () => {
    await openFromSidebar();
    // Settle, Fork, then the original.
    await key('ArrowDown');
    await key('ArrowDown');
    await key('Enter');
    await flush();
    expect(search()).toBeNull();
    expect(pushed).toEqual([session('m1', 'p1', 's1')]);
    expect(active).toBe('content');
    expect(document.activeElement).toBe(editor());
  });

  it('go back to the sidebar after one that stays, such as Settling', async () => {
    await openFromSidebar();
    await key('Enter');
    await flush();
    expect(search()).toBeNull();
    expect(settled).toEqual(['s2']);
    expect(pushed).toEqual([]);
    expect(active).toBe('sidebar');
    expect(document.activeElement).toBe(row());
  });
});
