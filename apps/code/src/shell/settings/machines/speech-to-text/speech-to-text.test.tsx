// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { SpeechToTextState } from '@kestack/ai-toolkit/api';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../keys.ts';
import { SpeechToTextLive } from './actor.ts';
import { SpeechToTextView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * One Machine's Speech to Text switch, drawn from what the Machine says,
 * live: nothing to switch until it says; off, with the switch off, and on
 * asks it to download; the download's progress; ready, with the switch
 * on, and off asks it to delete the model; failed, saying why, with a
 * retry.
 */

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    speech: { actor: SpeechToTextLive, input: () => ({ machineId: 'm1' }) },
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
      <SpeechToTextView instance={children.speech} />
    </keys.Provider>
  );
});

type Api = AiClient['Service'];

let says: Queue.Queue<SpeechToTextState>;
let switched: Array<'on' | 'off'> = [];

const services = AiClients.make(() =>
  Layer.merge(
    // An RPC client's procedures are generic over how they are called;
    // a stand-in answers the one way the app calls them.
    Layer.mock(AiClient)({
      watchSpeechToText: (() =>
        Stream.fromQueue(says)) as unknown as Api['watchSpeechToText'],
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

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  says = Effect.runSync(Queue.unbounded<SpeechToTextState>());
  switched = [];
  const App = toReact(OwnerLive, OwnerView, services, {
    name: `speech-to-text-test-${apps++}`,
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

describe('Speech to Text switch', () => {
  it('has nothing to switch until the Machine says how it stands', () => {
    expect(toggle()).toBeNull();
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
});
