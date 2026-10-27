import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import { Preferences, nothing } from '../../../../../../../../../store.ts';
import { owner, State, TouchDraftLive } from '../actor.ts';

/*
 * The Touch Draft under a Draft that counts its sends: how it follows
 * what its View asks of the Dictation and what the Dictation then says,
 * as its View hears it; where it goes back to, collapsed or open; and
 * Smart Input, kept in Preferences. Its View asks the Dictation itself
 * (`view.test.tsx`).
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
  const kept = yield* SubscriptionRef.make(nothing.smartInput);
  const device = Layer.mock(Preferences)({
    read: Effect.map(SubscriptionRef.get(kept), (smartInput) => ({
      ...nothing,
      smartInput,
    })),
    changes: SubscriptionRef.changes(kept).pipe(
      Stream.drop(1),
      Stream.map(() => undefined),
    ),
  });
  const app = (yield* Runtime.start(
    DraftLive as never,
    device as never,
  )) as Running<unknown>;
  yield* settle;
  const root = () => app.snapshot() as Instance;
  const touch = () => (root().children as { touch: Instance }).touch;
  return {
    state: () => Schema.decodeUnknownSync(State)(touch().state)._tag,
    then: () => Schema.decodeUnknownSync(State)(touch().state),
    sent: () => (root().model as { sent: number }).sent,
    /** Smart Input turned on or off, as Settings does. */
    smart: (on: boolean) =>
      Effect.andThen(SubscriptionRef.set(kept, on), settle),
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
  it('records once the Dictation does, started here or elsewhere', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        // Nothing heard yet: the Dictation may not start.
        expect(t.state()).toBe('Collapsed');
        yield* t.heard('recording');
        expect(t.state()).toBe('Recording');
      }),
    ));

  it('stays at rest when the Dictation cannot start', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('idle');
        expect(t.state()).toBe('Collapsed');
      }),
    ));

  it('takes the Dictation, and rests once its text is in, sending nothing', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Take', send: false });
        expect(t.then()).toEqual({
          _tag: 'Transcribing',
          then: 'take',
          said: false,
          open: false,
        });
        yield* t.heard('transcribing');
        yield* t.heard('text');
        yield* t.heard('idle');
        expect(t.state()).toBe('Collapsed');
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
        expect(t.state()).toBe('Collapsed');
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
        expect(t.state()).toBe('Collapsed');
      }),
    ));

  it('throws the Dictation away on a cancel while it is transcribed, sending nothing', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Take', send: true });
        yield* t.heard('transcribing');
        yield* t.send({ _tag: 'Cancel' });
        expect(t.state()).toBe('Collapsed');
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
        expect(t.state()).toBe('Collapsed');
        // The Retry, from rest, comes back the same way.
        yield* t.heard('transcribing');
        expect(t.state()).toBe('Transcribing');
        yield* t.heard('idle');
        expect(t.state()).toBe('Collapsed');
        expect(t.sent()).toBe(0);
      }),
    ));

  it('throws the Dictation away on cancel', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Cancel' });
        expect(t.state()).toBe('Collapsed');
        yield* t.heard('idle');
        expect(t.state()).toBe('Collapsed');
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
          open: false,
        });
      }),
    ));

  it('is the Composer once opened, until collapsed, and sending from it collapses it', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Open' });
        expect(t.state()).toBe('Editing');
        yield* t.send({ _tag: 'Collapse' });
        expect(t.state()).toBe('Collapsed');
        yield* t.send({ _tag: 'Open' });
        yield* t.send({ _tag: 'Send' });
        expect(t.sent()).toBe(1);
        expect(t.state()).toBe('Collapsed');
      }),
    ));

  it('with Smart Input, only opens, and is the Composer from Edit', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.smart(true);
        yield* t.send({ _tag: 'Open' });
        expect(t.state()).toBe('Expanded');
        yield* t.send({ _tag: 'Edit' });
        expect(t.state()).toBe('Editing');
        yield* t.send({ _tag: 'Collapse' });
        expect(t.state()).toBe('Collapsed');
      }),
    ));

  it('goes back to Expanded after a Dictation started open', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Open' });
        yield* t.heard('recording');
        expect(t.then()).toEqual({ _tag: 'Recording', open: true });
        yield* t.send({ _tag: 'Take', send: false });
        yield* t.heard('transcribing');
        yield* t.heard('text');
        yield* t.heard('idle');
        expect(t.state()).toBe('Expanded');
        // Cancelled, too.
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Cancel' });
        expect(t.state()).toBe('Expanded');
      }),
    ));

  it('collapses while a Dictation goes on, and rests collapsed after it', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Open' });
        yield* t.heard('recording');
        yield* t.send({ _tag: 'Collapse' });
        expect(t.then()).toEqual({ _tag: 'Recording', open: false });
        yield* t.send({ _tag: 'Take', send: false });
        yield* t.send({ _tag: 'Collapse' });
        expect(t.then()).toMatchObject({ _tag: 'Transcribing', open: false });
        yield* t.heard('transcribing');
        yield* t.heard('text');
        yield* t.heard('idle');
        expect(t.state()).toBe('Collapsed');
      }),
    ));

  it('sends from rest through the Draft', () =>
    run(
      Effect.gen(function* () {
        const t = yield* world;
        yield* t.send({ _tag: 'Send' });
        expect(t.sent()).toBe(1);
        expect(t.state()).toBe('Collapsed');
      }),
    ));
});
