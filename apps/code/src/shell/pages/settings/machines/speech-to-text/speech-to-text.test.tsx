// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import {
  CodeClient,
  CodeClients,
  type SpeechToTextState,
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
import { SpeechToTextLive } from './actor.ts';
import { SpeechToTextView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * One Machine's Speech to Text switch, drawn from what the Machine says,
 * live: nothing to switch until it says; off, with the switch off, and on
 * asks it to download; the download's progress; ready, with the switch
 * on, and off asks it to delete the model; failed, saying why, with a
 * retry. How it last stood, kept on this device and handed in, shows at
 * once, and what the Machine says replaces it and is kept. While its Line
 * is not connected, the switch takes nothing, and no "Locked" moves it.
 */

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    speech: {
      actor: SpeechToTextLive,
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
        <SpeechToTextView instance={children.speech} />
      </Connection>
    </keys.Provider>
  );
});

type Api = CodeClient['Service'];

let says: Queue.Queue<SpeechToTextState>;
let switched: Array<'on' | 'off'> = [];
let saved: Layer.Layer<SavedMachines>;
/** What this device kept, handed in as it opens. */
let handed: SpeechToTextState | null = null;

/** What the Machine says of its Speech to Text, as `Machines` hands it on. */
const machines = Layer.mock(Machines)({
  speech: () => Stream.fromQueue(says),
});

const clients = CodeClients.make(() =>
  Layer.merge(
    // An RPC client's procedures are generic over how they are called;
    // a stand-in answers the one way the app calls them.
    Layer.mock(CodeClient)({
      enableSpeechToText: (() =>
        Effect.sync(
          () => void switched.push('on'),
        )) as unknown as Api['enableSpeechToText'],
      disableSpeechToText: (() =>
        Effect.sync(
          () => void switched.push('off'),
        )) as unknown as Api['disableSpeechToText'],
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
const toggle = () => document.querySelector<HTMLElement>('[role="switch"]');
const text = () => document.body.textContent ?? '';

const say = async (state: SpeechToTextState) => {
  await act(async () => void Effect.runSync(Queue.offer(says, state)));
  await flush();
};

const click = async (element: HTMLElement) => {
  await act(async () => element.click());
  await flush();
};

/** What this device kept of the Machine's Speech to Text. */
const kept = () =>
  Effect.runPromise(
    Effect.flatMap(SavedMachines, (each) => each.settings('a1', 'm1')).pipe(
      Effect.provide(saved),
    ),
  );

const keep = (speech: SpeechToTextState) => {
  handed = speech;
};

const mount = async () => {
  const App = toReact(
    OwnerLive,
    OwnerView,
    Layer.mergeAll(machines, clients, saved),
    {
      name: `speech-to-text-test-${apps++}`,
    },
  );
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(pings).toBeGreaterThan(0);
};

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  says = Effect.runSync(Queue.unbounded<SpeechToTextState>());
  switched = [];
  saved = savedMachinesMemory();
  handed = null;
  line = 'connected';
  pings = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Speech to Text switch', () => {
  beforeEach(mount);

  it('has nothing to switch until the Machine says how it stands', () => {
    expect(toggle()?.hasAttribute('data-disabled')).toBe(true);
    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('is off while it is, and switching it on asks the Machine', async () => {
    await say({ _tag: 'Off' });
    expect(toggle()?.getAttribute('aria-checked')).toBe('false');
    await click(toggle()!);
    expect(switched).toEqual(['on']);
  });

  it('shows the download as it goes', async () => {
    await say({ _tag: 'Downloading', done: 115_000_000, total: 460_000_000 });
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');
    expect(text()).toContain('115 MB of 460 MB');
    expect(
      document
        .querySelector('[role="progressbar"]')
        ?.getAttribute('aria-valuenow'),
    ).toBe('25');
    await say({ _tag: 'Downloading', done: 230_000_000, total: 460_000_000 });
    expect(text()).toContain('230 MB of 460 MB');
  });

  it('is on once ready, and switching it off asks the Machine', async () => {
    await say({ _tag: 'Ready' });
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');
    expect(text()).toContain('Ready');
    await click(toggle()!);
    expect(switched).toEqual(['off']);
  });

  it('says why it failed, and tries again', async () => {
    await say({ _tag: 'Failed', reason: 'The download stopped' });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'The download stopped',
    );
    const retry = [...document.querySelectorAll('button')].find(
      (each) => each.textContent === 'Try again',
    )!;
    await click(retry);
    expect(switched).toEqual(['on']);
  });

  it('keeps what the Machine said, but not each step of a download', async () => {
    await say({ _tag: 'Downloading', done: 1, total: 10 });
    await say({ _tag: 'Downloading', done: 5, total: 10 });
    expect((await kept()).speech).toEqual({
      _tag: 'Downloading',
      done: 1,
      total: 10,
    });
    await say({ _tag: 'Ready' });
    expect((await kept()).speech).toEqual({ _tag: 'Ready' });
  });
});

describe('Speech to Text, kept on this device', () => {
  it('shows how it last stood at once, with no skeleton, then what the Machine says', async () => {
    keep({ _tag: 'Ready' });
    await mount();
    expect(document.querySelector('[aria-busy]')).toBeNull();
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');
    expect(text()).toContain('Ready');
    await say({ _tag: 'Off' });
    expect(toggle()?.getAttribute('aria-checked')).toBe('false');
    expect((await kept()).speech).toEqual({ _tag: 'Off' });
  });

  it("takes nothing while the Machine's Line is not connected, and says no Locked beside it", async () => {
    keep({ _tag: 'Off' });
    line = 'reconnecting';
    await mount();
    expect(toggle()?.getAttribute('aria-checked')).toBe('false');
    expect(toggle()?.hasAttribute('data-disabled')).toBe(true);
    expect(text()).not.toContain('Locked');
    await click(toggle()!);
    expect(switched).toEqual([]);
  });
});
