import { Effect, Layer, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import {
  type Ask,
  DeviceState,
  Dictations,
  nothing,
} from '../../../../../layer/capabilities/index.ts';
import { owner, State, TouchDraftLive } from './actor.ts';

/*
 * The Touch Draft under a Draft that counts its sends, with the
 * Dictation's queue read back: what it asks of the Dictation, and how it
 * follows what the Dictation then says, as its View hears it; and its
 * mode, kept in Device State.
 */

const Draft = Actor.define('Draft', {
  model: Schema.Struct({ sent: Schema.Finite }),
  message: Schema.TaggedUnion({ SendAsked: {} }),
});

const DraftLive = Actor.build(Draft, {
  init: () => ({ model: { sent: 0 } }),
  provides: (self) => owner(self.send({ _tag: 'SendAsked' })),
  children: { touch: { actor: TouchDraftLive } },
  on: {
    SendAsked: (_, { model }) => ({ model: { sent: model.sent + 1 } }),
  },
});

const settle = Effect.gen(function* () {
  for (let at = 0; at < 30; at++) yield* Effect.yieldNow;
});

const world = Effect.gen(function* () {
  const asked = yield* Queue.unbounded<typeof Ask.Type>();
  const kept = yield* SubscriptionRef.make(nothing.touchMode);
  const device = Layer.mock(DeviceState)({
    read: Effect.map(SubscriptionRef.get(kept), (touchMode) => ({
      ...nothing,
      touchMode,
    })),
    setTouchMode: (mode) => SubscriptionRef.set(kept, mode),
    changes: SubscriptionRef.changes(kept).pipe(
      Stream.drop(1),
      Stream.map(() => undefined),
    ),
  });
  const app = (yield* Runtime.start(
    DraftLive as never,
    Layer.merge(Layer.succeed(Dictations, { asked }), device) as never,
  )) as Running<unknown>;
  yield* settle;
  const root = () => app.snapshot() as Instance;
  const touch = () => (root().children as { touch: Instance }).touch;
  return {
    /** What the Touch Draft asked of the Dictation since last read. */
    asks: () =>
      Effect.map(Queue.clear(asked), (all) => all.map(({ _tag }) => _tag)),
    state: () => Schema.decodeUnknownSync(State)(touch().state)._tag,
    then: () => Schema.decodeUnknownSync(State)(touch().state),
    sent: () => (root().model as { sent: number }).sent,
    mode: () => (touch().model as { mode: string }).mode,
    kept: () => SubscriptionRef.get(kept),
    /** Another tab writes it. */
    keep: (mode: 'text' | 'voice') =>
      Effect.andThen(SubscriptionRef.set(kept, mode), settle),
    send: (message: { readonly _tag: string; readonly [k: string]: unknown }) =>
      Effect.andThen(
        Effect.sync(() => app.send(touch().id, message)),
        settle,
      ),
    heard: (dictation: string, sendable = true) =>
      Effect.andThen(
        Effect.sync(() =>
          app.send(touch().id, { _tag: 'Heard', dictation, sendable }),
        ),
        settle,
      ),
  };
});

const run = (test: Effect.Effect<void, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(test) as Effect.Effect<void>);

describe('Touch Draft', () => {
  it('starts a Dictation from rest, and records once the Dictation does', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Dictate' });
        expect(yield* t.asks()).toEqual(['Toggle']);
        // Nothing heard yet: the Dictation may not start.
        expect(t.state()).toBe('Resting');
        yield* t.heard('recording');
        expect(t.state()).toBe('Recording');
      }),
    ));

  it('stays at rest when the Dictation cannot start', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Dictate' });
        yield* t.heard('idle');
        expect(t.state()).toBe('Resting');
      }),
    ));

  it('takes the Dictation, and rests once its text is in, sending nothing', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.asks();
        yield* t.send({ _tag: 'Take', send: false });
        expect(yield* t.asks()).toEqual(['Toggle']);
        expect(t.then()).toEqual({
          _tag: 'Transcribing',
          then: 'take',
          said: false,
        });
        yield* t.heard('transcribing');
        yield* t.heard('text');
        yield* t.heard('idle');
        expect(t.state()).toBe('Resting');
        expect(t.sent()).toBe(0);
      }),
    ));

  it('takes and sends: the Draft is sent once the text is in', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Take', send: true });
        yield* t.heard('transcribing');
        expect(t.sent()).toBe(0);
        yield* t.heard('text');
        expect(t.sent()).toBe(0);
        yield* t.heard('idle');
        expect(t.sent()).toBe(1);
        expect(t.state()).toBe('Resting');
      }),
    ));

  it('keeps the text and sends nothing when the Draft cannot be sent as its text comes in', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Take', send: true });
        yield* t.heard('transcribing');
        yield* t.heard('text');
        // The line dropped meanwhile.
        yield* t.heard('idle', false);
        expect(t.sent()).toBe(0);
        expect(t.state()).toBe('Resting');
      }),
    ));

  it('throws the Dictation away on a cancel while it is transcribed, sending nothing', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Take', send: true });
        yield* t.asks();
        yield* t.heard('transcribing');
        yield* t.send({ _tag: 'Cancel' });
        expect(yield* t.asks()).toEqual(['Cancel']);
        expect(t.state()).toBe('Resting');
        yield* t.heard('idle');
        expect(t.sent()).toBe(0);
      }),
    ));

  it('sends nothing when the Dictation cannot be transcribed, or heard nothing', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Take', send: true });
        yield* t.heard('transcribing');
        yield* t.heard('failed');
        expect(t.state()).toBe('Resting');
        // The Retry, from rest, comes back the same way.
        yield* t.heard('transcribing');
        expect(t.state()).toBe('Transcribing');
        yield* t.heard('idle');
        expect(t.state()).toBe('Resting');
        expect(t.sent()).toBe(0);
      }),
    ));

  it('throws the Dictation away on cancel', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Cancel' });
        expect(yield* t.asks()).toEqual(['Cancel']);
        expect(t.state()).toBe('Resting');
        yield* t.heard('idle');
        expect(t.state()).toBe('Resting');
      }),
    ));

  it('takes a Dictation that stops on its own', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.heard('transcribing');
        expect(t.then()).toEqual({
          _tag: 'Transcribing',
          then: 'take',
          said: false,
        });
      }),
    ));

  it('is the Composer from edit until done, and sending from it closes it', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Edit' });
        expect(t.state()).toBe('Editing');
        yield* t.send({ _tag: 'Done' });
        expect(t.state()).toBe('Resting');
        yield* t.send({ _tag: 'Edit' });
        yield* t.send({ _tag: 'Send' });
        expect(t.sent()).toBe(1);
        expect(t.state()).toBe('Resting');
      }),
    ));

  it('sends from rest through the Draft', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Send' });
        expect(t.sent()).toBe(1);
        expect(t.state()).toBe('Resting');
        expect(yield* t.asks()).toEqual([]);
      }),
    ));

  it('is voice until text is chosen, and keeps the choice in Device State', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        expect(t.mode()).toBe('voice');
        yield* t.send({ _tag: 'Choose', mode: 'text' });
        expect(t.mode()).toBe('text');
        expect(yield* t.kept()).toBe('text');
      }),
    ));

  it('follows a mode chosen in another tab', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.keep('text');
        expect(t.mode()).toBe('text');
      }),
    ));
});
