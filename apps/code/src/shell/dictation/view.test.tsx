// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { Cause } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { toReact, useChild, View } from '@kestack/kabuki/react';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Recorder } from '../recorder/index.ts';
import { Ask, ask, DictationLive, Dictations } from './actor.ts';
import { Dictating, useDictation } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Dictation as a page draws it, while it records: the level and the
 * time move many times a second, and only the meter and the clock draw
 * again for them. The page around the Draft, which asks `useDictation`,
 * draws again only as the Dictation starts, stops or changes microphone.
 */

const Owner = Actor.define('Owner', {
  requires: [Dictations],
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {}, Ask: { ask: Ask } }),
});

const place = { machineId: 'm1', projectId: 'p1', sessionId: 's1' };

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    dictation: {
      actor: DictationLive,
      props: () => ({ machineIds: ['m1'], microphone: null, place }),
    },
  },
  on: {
    Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }),
    Ask: ({ ask: asked }) => ({ command: ask(asked) }),
  },
});

let pings = 0;
let ping = () => {};
let pageDrawn = 0;
let canStart = false;

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  canStart =
    useChild(children.dictation, ({ model }) => {
      const m1 = model.machines['m1'];
      return m1?.ready === true && m1.answering;
    }) === true;
  return (
    <Dictating
      value={{
        dictation: children.dictation,
        ask: (asked) => send({ _tag: 'Ask', ask: asked }),
        microphones: null,
        shown: () => () => {},
      }}
    >
      <Page />
    </Dictating>
  );
});

/** A page with a Draft, as far as the Dictation goes. */
function Page() {
  pageDrawn++;
  const { recording, onToggle } = useDictation(place);
  return (
    <div>
      <button type="button" onClick={onToggle}>
        Dictate
      </button>
      {recording?._tag === 'Recording' && (
        <p data-testid="recording">
          {recording.microphone} {recording.elapsed} {recording.level}
        </p>
      )}
    </div>
  );
}

type Api = AiClient['Service'];

let levels: Queue.Queue<number, Cause.Done>;

const services = () =>
  Effect.runSync(
    Effect.map(Queue.unbounded<number, Cause.Done>(), (queue) => {
      levels = queue;
      return Layer.mergeAll(
        Dictations.layer,
        AiClients.make(() =>
          Layer.merge(
            // An RPC client's procedures are generic over how they are
            // called; a stand-in answers the one way the app calls them.
            Layer.mock(AiClient)({
              watchSpeechToText: (() =>
                Stream.make({
                  _tag: 'Ready' as const,
                })) as unknown as Api['watchSpeechToText'],
            }),
            Layer.mock(RpcConnection)({
              connectionStatus: Stream.concat(
                Stream.make('connected' as const),
                Stream.never,
              ),
              keepSubscribed: (subscribe) => subscribe(),
              hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
            }),
          ),
        ),
        Layer.succeed(Recorder, {
          record: () =>
            Effect.succeed({
              heard: { name: 'MacBook Pro Microphone', fellBack: false },
              levels: Stream.fromQueue(queue),
            }),
          switchTo: () => Effect.succeed(null),
          clip: Effect.never,
          inputs: Stream.empty,
        }),
      );
    }),
  );

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const bars = () =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="level"] > span')].map(
    ({ style }) => style.transform,
  );

beforeEach(async () => {
  pageDrawn = 0;
  canStart = false;
  const App = toReact(OwnerLive, OwnerView, services(), {
    name: `dictation-view-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && (pings === 0 || !canStart); tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(canStart).toBe(true);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('the Dictation, drawn', () => {
  it('moves the meter with each level without drawing the page again', async () => {
    await act(async () => document.querySelector('button')!.click());
    await flush();
    await flush();
    expect(
      document.querySelector('[data-testid="recording"]')?.textContent,
    ).toBe('MacBook Pro Microphone 0:00 ');
    const before = pageDrawn;
    for (const level of [0.2, 0.9, 0.5, 1]) {
      await act(async () => void Queue.offerUnsafe(levels, level));
      await flush();
    }
    expect(bars()).toEqual(['scaleY(0.55)', 'scaleY(1)', 'scaleY(0.75)']);
    expect(pageDrawn).toBe(before);
  });
});
