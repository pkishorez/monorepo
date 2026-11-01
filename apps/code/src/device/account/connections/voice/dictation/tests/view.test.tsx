// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { Cause } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor, Command } from '@kestack/kabuki';
import { View, useChild } from '@kestack/kabuki/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ask, Dictations } from '../../voice.ts';
import { Preferences, nothing } from '../../../../../store.ts';
import { Connections, nobody } from '../../../connections.ts';
import { Recorder } from '../../recorder/index.ts';
import { dictations } from '../../voice.ts';
import { DictationLive } from '../actor.ts';
import { Dictating, owners, useDictation } from '../view.tsx';

/** Hands an ask to the Dictation, as Voice does. */
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
 * A field sees only its own: one recording for another is, to it, only
 * a reason it cannot start one. The keys start one for the field focus
 * is in, else the last Draft drawn.
 */

const Owner = Actor.define('Owner', {
  requires: [Dictations],
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {}, Ask: { ask: Ask } }),
});

const OwnerLive = Owner.build({
  init: () => ({ model: { pings: 0 } }),
  children: {
    dictation: Actor.child(DictationLive, {
      props: () => ({ drawn: true }),
    }),
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
let other: { tag: string; recording: boolean } = { tag: '', recording: false };
const drawnFields = owners();

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  canStart =
    useChild(children.dictation, ({ model }) => {
      const m1 = model.connections['m1'];
      return m1?.ready === true && m1.answering;
    }) === true;
  return (
    <Dictating
      value={{
        dictation: children.dictation,
        ask: (asked) => send({ _tag: 'Ask', ask: asked }),
        owners: drawnFields,
        microphones: () => null,
        chooseMicrophone: () => {},
        drawn: null,
      }}
    >
      <Page />
      <Other />
    </Dictating>
  );
});

/** A page with a Draft, as far as the Dictation goes. */
function Page() {
  pageDrawn++;
  const { recording, onToggle } = useDictation({
    key: 's1',
    connectionId: 'm1',
  });
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

/** Another field, such as a question's answer, beside the Draft. */
function Other() {
  const { recording, availability } = useDictation({
    key: 'q1',
    connectionId: 'm1',
  });
  other = { tag: availability._tag, recording: recording !== null };
  return null;
}

let levels: Queue.Queue<number, Cause.Done>;

const services = () =>
  Effect.runSync(
    Effect.map(Queue.unbounded<number, Cause.Done>(), (queue) => {
      levels = queue;
      return Layer.mergeAll(
        dictations,
        // One Connection, answering, its Speech to Text Ready.
        Layer.mock(Connections)({
          state: Stream.make({
            ...nobody,
            accountId: 'a1',
            connections: [
              {
                id: 'm1',
                name: 'm1',
                key: 'key-m1',
                version: '0.0.1',
                status: { _tag: 'Opening' },
                lastSeen: 1,
                plugins: {},
                wanted: {},
                minConnect: null,
              },
            ],
            links: { m1: 'linked' },
            setups: {
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
        Layer.mock(Preferences)({
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
  const App = View.app(OwnerView, {
    layer: services(),
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

  it('shows another field only that it cannot start one', async () => {
    expect(other).toEqual({ tag: 'Ready', recording: false });
    await act(async () => document.querySelector('button')!.click());
    await flush();
    await flush();
    expect(document.querySelector('[data-testid="recording"]')).not.toBeNull();
    expect(other).toEqual({ tag: 'Busy', recording: false });
  });
});

describe('the fields drawn, for the keys', () => {
  it('start one for the field focus is in, else the last Draft drawn', () => {
    const fields = owners();
    const box = document.body.appendChild(document.createElement('div'));
    const input = box.appendChild(document.createElement('input'));
    const outside = document.body.appendChild(document.createElement('input'));
    expect(fields.focused()).toBeNull();
    const draft = fields.show({
      owner: { key: 's1', connectionId: 'm1' },
      within: () => null,
      fallback: true,
    });
    const answer = fields.show({
      owner: { key: 'q1', connectionId: 'm1' },
      within: () => box,
      fallback: false,
    });
    outside.focus();
    expect(fields.focused()?.key).toBe('s1');
    input.focus();
    expect(fields.focused()?.key).toBe('q1');
    answer();
    expect(fields.focused()?.key).toBe('s1');
    draft();
    expect(fields.focused()).toBeNull();
  });
});
