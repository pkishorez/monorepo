// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { Cause } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor, Command } from '@kestack/kabuki';
import { toReact, useChild, View } from '@kestack/kabuki/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Ask,
  DeviceState,
  Dictations,
  Machines,
  nobody,
  nothing,
  Recorder,
} from '../../../layer/capabilities/index.ts';
import { dictations } from '../../../layer/services/index.ts';
import { DictationLive } from './actor.ts';
import { Dictating, useDictation } from './view.tsx';

/** Hands an ask to the Dictation, as the root page does. */
const ask = Command.make('AskDictation', {
  args: Ask,
  run: (asked) =>
    Effect.flatMap(Dictations, ({ asked: queue }) =>
      Effect.asVoid(Queue.offer(queue, asked)),
    ),
});

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
      props: () => ({ place }),
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
        chooseMicrophone: () => {},
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
          {recording.wave}
        </p>
      )}
    </div>
  );
}

let levels: Queue.Queue<number, Cause.Done>;

const services = () =>
  Effect.runSync(
    Effect.map(Queue.unbounded<number, Cause.Done>(), (queue) => {
      levels = queue;
      return Layer.mergeAll(
        dictations,
        // One Machine, answering, its Speech to Text Ready.
        Layer.mock(Machines)({
          state: Stream.make({
            ...nobody,
            accountId: 'a1',
            machines: [
              {
                id: 'm1',
                name: 'm1',
                key: 'key-m1',
                version: '0.0.1',
                status: { _tag: 'Opening' },
                lastSeen: 1,
              },
            ],
            lines: { m1: 'connected' },
            kits: {
              m1: {
                accounts: null,
                speech: { _tag: 'Ready' },
                harnesses: null,
                models: [],
                savedRead: true,
                problem: null,
              },
            },
          }),
        }),
        Layer.mock(DeviceState)({
          read: Effect.succeed(nothing),
          changes: Stream.never,
        }),
        Layer.mock(CodeClients)({}),
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

const wavebars = () =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="wave"] > span')].map(
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

  it('draws the waveform of the last levels heard, the newest on the right', async () => {
    await act(async () => document.querySelector('button')!.click());
    await flush();
    await flush();
    for (const level of [0.2, 0.6]) {
      await act(async () => void Queue.offerUnsafe(levels, level));
      await flush();
    }
    const wave = wavebars();
    expect(wave).toHaveLength(64);
    expect(wave.slice(-2)).toEqual(['scaleY(0.36)', 'scaleY(1)']);
    expect(wave[0]).toBe('scaleY(0.1)');
  });
});
