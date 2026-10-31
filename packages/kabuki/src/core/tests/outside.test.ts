import { Effect, Fiber, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Actor, History, Runtime } from '../index.ts';
import type { LiveInstance, Sent } from '../runtime/index.ts';
import { timed } from './fixtures.ts';

/*
 * Code outside the tree tells an Instance with `send`, which says what
 * became of the Message, and waits on it with `until`, which reads the data
 * the History keeps.
 */

let knock: (() => Sent) | undefined;

const Door = Actor.define('Door', {
  model: { opened: Schema.Number },
  state: { Closed: {}, Opening: {}, Open: { by: Schema.String } },
  message: {
    Pushed: { by: Schema.String },
    Swung: { by: Schema.String },
    Knocked: {},
    Shut: {},
  },
});

const DoorLive = Door.build({
  init: () => ({ model: { opened: 0 }, state: { _tag: 'Closed' } }),
  on: { Knocked: () => ({}) },
  states: {
    Closed: {
      on: { Pushed: () => ({ state: { _tag: 'Opening' } }) },
    },
    Opening: {
      workers: {
        swing: {
          run: (self) =>
            Effect.gen(function* () {
              const sent = knock?.();
              if (sent !== undefined) knocks.push(sent);
              yield* Effect.sleep('1 second');
              yield* self.send({ _tag: 'Swung', by: 'hinge' });
            }),
        },
      },
      on: {
        Swung: ({ by }, { model }) => ({
          state: { _tag: 'Open', by },
          model: { opened: model.opened + 1 },
        }),
      },
    },
    Open: { on: { Shut: () => ({ state: { _tag: 'Closed' } }) } },
  },
});

const knocks: Array<Sent> = [];

describe('send says what became of a Message', () => {
  it('handled by a rule, ignored with none in this State, refused once stopped', () =>
    timed(
      Effect.gen(function* () {
        const running = yield* Runtime.start(DoorLive);
        const door = running.instance({ from: 'test' });
        expect(door.send({ _tag: 'Shut' })).toBe('ignored');
        expect(door.send({ _tag: 'Pushed', by: 'ada' })).toBe('handled');
        expect(door.send({ _tag: 'Pushed', by: 'ada' })).toBe('ignored');
        yield* running.stop();
        expect(door.send({ _tag: 'Knocked' })).toBe('refused');
      }),
    ));

  it('queued, when Sent while another Message is being handled', () =>
    timed(
      Effect.gen(function* () {
        const running = yield* Runtime.start(History.make(DoorLive));
        const door = running.instance({ from: 'test' });
        knock = () => door.send({ _tag: 'Knocked' });
        knocks.length = 0;
        // The Worker starts, and Sends, while `Pushed` is being handled.
        door.send({ _tag: 'Pushed', by: 'ada' });
        knock = undefined;
        expect(knocks).toEqual(['queued']);
        expect(
          running.history.branch().map(({ message }) => message._tag),
        ).toEqual(['Pushed', 'Knocked']);
      }),
    ));
});

describe('until waits for the data', () => {
  it('answers at once when the test already passes', () =>
    timed(
      Effect.gen(function* () {
        const running = yield* Runtime.start(DoorLive);
        const door = running.instance({ from: 'test' });
        const closed = yield* Effect.orDie(
          door.until((now) => now._tag === 'Closed'),
        );
        expect(closed._tag).toBe('Closed');
      }),
    ));

  it('answers once a Message makes the test pass, narrowed as the test narrows it', () =>
    timed(
      Effect.gen(function* () {
        const running = yield* Runtime.start(DoorLive);
        const door = running.instance({ from: 'test' });
        door.send({ _tag: 'Pushed', by: 'ada' });
        const waiting = yield* Effect.forkChild(
          door.until((now) => now._tag === 'Open'),
        );
        yield* TestClock.adjust('1 second');
        const open = yield* Effect.orDie(Fiber.join(waiting));
        expectTypeOf(open.state).toEqualTypeOf<{
          readonly _tag: 'Open';
          readonly by: string;
        }>();
        expect(open.state.by).toBe('hinge');
        expect(open.model.opened).toBe(1);
      }),
    ));

  it('fails with Stopped when the app stops first', () =>
    timed(
      Effect.gen(function* () {
        const running = yield* Runtime.start(DoorLive);
        const door: LiveInstance<typeof DoorLive> = running.instance({
          from: 'test',
        });
        const waiting = yield* Effect.forkChild(
          door.until((now) => now._tag === 'Open'),
        );
        yield* Effect.yieldNow;
        yield* running.stop();
        const failed = yield* Effect.orDie(Effect.flip(Fiber.join(waiting)));
        expect(failed._tag).toBe('Stopped');
        expect(failed.instance).toBe('Door');
      }),
    ));

  it('sees a State one Message enters and the next leaves, in one drain', () =>
    timed(
      Effect.gen(function* () {
        let reset: (() => Sent) | undefined;
        const Flicker = Actor.define('Flicker', {
          model: { n: Schema.Number },
          message: { Started: {}, Reset: {} },
        }).build({
          init: () => ({ model: { n: 0 } }),
          on: {
            Started: () => ({ model: { n: 1 } }),
            Reset: () => ({ model: { n: 0 } }),
          },
          workers: {
            // Sends as it starts, while `Started` is still being handled.
            undo: {
              while: ({ model }) => model.n === 1,
              run: () => Effect.sync(() => reset?.()),
            },
          },
        });
        const running = yield* Runtime.start(History.make(Flicker));
        const flicker = running.instance({ from: 'test' });
        reset = () => flicker.send({ _tag: 'Reset' });
        const waiting = yield* Effect.forkChild(
          flicker.until((now) => now.model.n === 1),
        );
        yield* Effect.yieldNow;
        flicker.send({ _tag: 'Started' });
        yield* Effect.yieldNow;
        expect(
          running.history.branch().map(({ message }) => message._tag),
        ).toEqual(['Started', 'Reset']);
        expect(flicker.model.n).toBe(0);
        const seen = yield* Effect.orDie(Fiber.join(waiting));
        expect(seen.id).toBe('Flicker');
      }),
    ));

  it('ends with a defect when its test throws, and the app goes on', () =>
    timed(
      Effect.gen(function* () {
        const running = yield* Runtime.start(DoorLive);
        const door = running.instance({ from: 'test' });
        let calls = 0;
        const broken = yield* Effect.forkChild(
          door.until(() => {
            if (calls++ > 0) throw new Error('broken test');
            return false;
          }),
        );
        const fine = yield* Effect.forkChild(
          door.until((now) => now._tag === 'Opening'),
        );
        yield* Effect.yieldNow;
        expect(door.send({ _tag: 'Pushed', by: 'ada' })).toBe('handled');
        const exit = yield* Fiber.await(broken);
        expect(exit._tag).toBe('Failure');
        expect(String(exit)).toContain('broken test');
        expect((yield* Effect.orDie(Fiber.join(fine)))._tag).toBe('Opening');
        expect(door.send({ _tag: 'Knocked' })).toBe('handled');
      }),
    ));
});
