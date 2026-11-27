import { Effect, Exit, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, History } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { KabukiSession } from '../contract/index.ts';
import type { Sent } from '../contract/index.ts';
import { inPage } from '../real/index.ts';
import { running, started } from './diary.ts';

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});

const sessionOf = (app: AppRuntime) =>
  Effect.provide(Effect.service(KabukiSession), inPage(app));

const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;

let knock: (() => Sent) | undefined;
const knocks: Array<Sent> = [];

const Door = Actor.define('Door', {
  state: { Closed: {}, Opening: {} },
  message: { Pushed: {}, Shut: {}, Knocked: {} },
}).build({
  init: () => ({ state: { _tag: 'Closed' } }),
  on: { Knocked: () => ({}) },
  states: {
    Closed: { on: { Pushed: () => ({ state: { _tag: 'Opening' } }) } },
    Opening: {
      workers: {
        swing: {
          run: () =>
            Effect.sync(() => {
              const sent = knock?.();
              if (sent !== undefined) knocks.push(sent);
            }).pipe(Effect.andThen(Effect.never)),
        },
      },
      on: { Shut: () => ({ state: { _tag: 'Closed' } }) },
    },
  },
});

const door = Effect.gen(function* () {
  const opened = yield* running(Door);
  return { ...opened, session: yield* sessionOf(opened.app) };
});

describe('send', () => {
  it('decodes an encoded Message by its Actor’s Schema, and Sends it from DevTools: handled', () =>
    run(
      Effect.gen(function* () {
        const diary = yield* started;
        const session = yield* sessionOf(diary.app);
        const sent = yield* session.send({
          to: 'Diary',
          message: {
            _tag: 'Wrote',
            note: { at: new Date(5).toISOString(), text: 'first' },
          },
        });
        expect(sent).toBe('handled');
        expect(diary.runtime.snapshot.root.model.notes).toEqual([
          { at: new Date(5), text: 'first' },
        ]);
        const [entry] = History.entries(diary.app.history);
        expect(entry!.from).toEqual({ kind: 'outside', name: 'devtools' });
      }),
    ));

  it('to a Child, by its Address', () =>
    run(
      Effect.gen(function* () {
        const diary = yield* started;
        const session = yield* sessionOf(diary.app);
        expect(
          yield* session.send({
            to: 'Diary/counter#1',
            message: { _tag: 'Bumped' },
          }),
        ).toBe('handled');
        expect(diary.runtime.snapshot.root.children.counter.model.count).toBe(
          1,
        );
      }),
    ));

  it('answers ignored for a Message with no rule in the State the Instance is in', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* door;
        expect(
          yield* session.send({ to: 'Door', message: { _tag: 'Shut' } }),
        ).toBe('ignored');
      }),
    ));

  it('answers queued for a Message Sent while another is being handled', () =>
    run(
      Effect.gen(function* () {
        const { session } = yield* door;
        knocks.length = 0;
        knock = () =>
          Effect.runSync(
            session.send({ to: 'Door', message: { _tag: 'Knocked' } }),
          );
        expect(
          yield* session.send({ to: 'Door', message: { _tag: 'Pushed' } }),
        ).toBe('handled');
        knock = undefined;
        expect(knocks).toEqual(['queued']);
      }),
    ));

  it('answers refused while the Runtime is stopped', () =>
    run(
      Effect.gen(function* () {
        const { session, runtime } = yield* door;
        yield* Effect.promise(() => runtime.stop());
        expect(
          yield* session.send({ to: 'Door', message: { _tag: 'Knocked' } }),
        ).toBe('refused');
      }),
    ));

  it('says there is no such Instance, and which there are', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* started;
        const session = yield* sessionOf(app);
        expect(
          failure(
            yield* Effect.exit(
              session.send({
                to: 'Diary/counter#9',
                message: { _tag: 'Bumped' },
              }),
            ),
          ),
        ).toMatchObject({
          error: {
            _tag: 'InstanceNotFound',
            instance: 'Diary/counter#9',
            at: 'start',
            available: ['Diary', 'Diary/counter#1'],
          },
        });
      }),
    ));

  it('refuses a Message its Actor does not take, or its Schema refuses, saying why', () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* started;
        const session = yield* sessionOf(app);
        const refused = (message: unknown) =>
          Effect.map(
            Effect.exit(session.send({ to: 'Diary', message })),
            failure,
          );
        expect(yield* refused({ _tag: 'Bumped' })).toMatchObject({
          error: {
            _tag: 'MessageRefused',
            to: 'Diary',
            tag: 'Bumped',
            reason: 'Diary takes no Message Bumped; it takes Wrote',
          },
        });
        expect(yield* refused('Wrote')).toMatchObject({
          error: { _tag: 'MessageRefused', tag: '' },
        });
        const bad = yield* refused({
          _tag: 'Wrote',
          note: { at: 5, text: 'first' },
        });
        expect(bad).toMatchObject({
          error: { _tag: 'MessageRefused', tag: 'Wrote' },
        });
        expect(
          (bad as { readonly error: { readonly reason: string } }).error.reason,
        ).toContain('at');
        expect(History.entries(app.history)).toEqual([]);
      }),
    ));

  it('refuses to Send while the app Seeks a past Step', () =>
    run(
      Effect.gen(function* () {
        const diary = yield* started;
        diary.write('first', 5);
        yield* settle;
        const session = yield* sessionOf(diary.app);
        diary.app.seek(null);
        expect(
          failure(
            yield* Effect.exit(
              session.send({
                to: 'Diary/counter#1',
                message: { _tag: 'Bumped' },
              }),
            ),
          ),
        ).toMatchObject({ error: { _tag: 'Seeking', step: 'start' } });
        diary.app.toHead();
        expect(
          yield* session.send({
            to: 'Diary/counter#1',
            message: { _tag: 'Bumped' },
          }),
        ).toBe('handled');
      }),
    ));

  it('takes every Message the Schema encodes, a Date as its string', () =>
    run(
      Effect.gen(function* () {
        const Stamp = Actor.define('Stamp', {
          model: { at: Schema.NullOr(Schema.DateFromString) },
          message: { Stamped: { at: Schema.DateFromString } },
        }).build({
          init: () => ({ model: { at: null } }),
          on: { Stamped: ({ at }) => ({ model: { at } }) },
        });
        const { app, runtime } = yield* running(Stamp);
        const session = yield* sessionOf(app);
        yield* session.send({
          to: 'Stamp',
          message: { _tag: 'Stamped', at: new Date(7).toISOString() },
        });
        expect(runtime.snapshot.root.model.at).toEqual(new Date(7));
      }),
    ));
});
