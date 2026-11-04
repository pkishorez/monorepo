import { Effect, Fiber, References, Stream, SubscriptionRef } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  makeTakes,
  type ModelNow,
  type TakeHeard,
  TakeFailed,
} from '../index.js';
import { IDLE, quietest, TAIL } from '../takes.js';

/*
 * Takes over a stand-in model that hears how many samples it was handed.
 * A Take is heard as its stretches come in, in whatever order, and Done
 * once its end and every stretch it counts are in. Speech to Text off, it
 * is switched on, and the download shows first. A long tail is cut, and
 * what came before the cut stays. Calls that reach a new Take together
 * start one. A Take nobody watches is forgotten after a while; one watched
 * never is, and one that breaks fails its watchers.
 */

const eventually = (assertion: () => void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 5_000, interval: 10 }));

/** A stretch of `length` samples, loud unless `quiet`. */
const stretch = (length: number, quiet = false) =>
  Float32Array.from({ length }, (_, at) => (quiet ? 0 : Math.sin(at) / 2));

/** On a clock moved by hand. */
const timed = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.provide(effect, TestClock.layer()));

const model = (
  start: ModelNow['_tag'],
  transcribe?: (samples: Float32Array<ArrayBuffer>) => Effect.Effect<string>,
) =>
  Effect.gen(function* () {
    const now = yield* SubscriptionRef.make<ModelNow>(
      start === 'Downloading'
        ? { _tag: 'Downloading', done: 0, total: 10 }
        : start === 'Failed'
          ? { _tag: 'Failed', reason: 'No network' }
          : ({ _tag: start } as ModelNow),
    );
    const heard: Array<number> = [];
    let enabled = 0;
    return {
      now,
      heard,
      enabled: () => enabled,
      model: {
        now: SubscriptionRef.changes(now),
        enable: Effect.andThen(
          Effect.sync(() => void enabled++),
          SubscriptionRef.set(now, {
            _tag: 'Downloading',
            done: 0,
            total: 10,
          }),
        ),
        transcribe: (samples: Float32Array<ArrayBuffer>) =>
          transcribe?.(samples) ??
          Effect.sync(() => {
            heard.push(samples.length);
            return `${samples.length}`;
          }),
      },
    };
  });

/** Watches `id`, keeping all it says. */
const watching = (
  takes: Effect.Success<ReturnType<typeof makeTakes>>,
  id: string,
) =>
  Effect.gen(function* () {
    const seen: Array<TakeHeard> = [];
    const fiber = yield* Effect.forkScoped(
      Stream.runForEach(takes.watch(id), (heard) =>
        Effect.sync(() => void seen.push(heard)),
      ),
    );
    return { seen, fiber };
  });

describe('Takes', () => {
  it('hears each stretch as it comes, in any order, and is Done once all are in', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Ready');
          const takes = yield* makeTakes(stood.model);
          const { seen, fiber } = yield* watching(takes, 't1');

          yield* takes.add('t1', 1, stretch(200));
          yield* takes.add('t1', 0, stretch(100));
          yield* eventually(() =>
            expect(seen.at(-1)).toEqual({ _tag: 'Heard', text: '300' }),
          );
          // Sent again: nothing changes.
          yield* takes.add('t1', 0, stretch(100));
          yield* takes.end('t1', 3);
          yield* takes.add('t1', 2, stretch(50));
          yield* Fiber.join(fiber);
          expect(seen.at(-1)).toEqual({ _tag: 'Done', text: '350' });
          expect(stood.enabled()).toBe(0);
        }),
      ),
    ));

  it('switches Speech to Text on, shows the download, then hears what came meanwhile', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Off');
          const takes = yield* makeTakes(stood.model);
          yield* takes.add('t1', 0, stretch(100));
          yield* takes.end('t1', 1);
          const { seen, fiber } = yield* watching(takes, 't1');
          yield* eventually(() =>
            expect(seen.at(-1)).toEqual({
              _tag: 'Downloading',
              done: 0,
              total: 10,
            }),
          );
          expect(stood.enabled()).toBe(1);
          expect(stood.heard).toEqual([]);

          yield* SubscriptionRef.set(stood.now, { _tag: 'Ready' });
          yield* Fiber.join(fiber);
          expect(seen.at(-1)).toEqual({ _tag: 'Done', text: '100' });
        }),
      ),
    ));

  it('fails its watchers when the download fails', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Downloading');
          const takes = yield* makeTakes(stood.model);
          const { seen, fiber } = yield* watching(takes, 't1');
          yield* eventually(() =>
            expect(seen.at(-1)?._tag).toBe('Downloading'),
          );
          yield* SubscriptionRef.set(stood.now, {
            _tag: 'Failed',
            reason: 'No network',
          });
          const exit = yield* Fiber.await(fiber);
          expect(exit).toMatchObject({
            _tag: 'Failure',
            cause: {
              reasons: [{ error: new TakeFailed({ message: 'No network' }) }],
            },
          });
        }),
      ),
    ));

  it('cuts a long tail at its quietest moment, and keeps what came before', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Ready');
          const takes = yield* makeTakes(stood.model);
          const loud = stretch(TAIL / 2 + 16_000 * 2);
          const quiet = stretch(16_000, true);
          yield* takes.add('t1', 0, loud);
          yield* takes.add('t1', 1, quiet);
          yield* takes.add('t1', 2, loud);
          yield* takes.end('t1', 3);
          const { seen, fiber } = yield* watching(takes, 't1');
          yield* Fiber.join(fiber);
          const total = loud.length * 2 + quiet.length;
          const done = seen.at(-1);
          expect(done?._tag).toBe('Done');
          const parts = (done as { text: string }).text.split(' ').map(Number);
          expect(parts.reduce((all, part) => all + part, 0)).toBe(total);
          // The cut is inside the quiet stretch.
          expect(parts[0]).toBeGreaterThan(loud.length);
          expect(parts[0]).toBeLessThan(loud.length + quiet.length);
        }),
      ),
    ));

  it('starts one Take for calls that reach a new one together', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Ready');
          const takes = yield* makeTakes(stood.model);
          const [{ seen, fiber }] = yield* Effect.all(
            [
              watching(takes, 't1'),
              ...Array.from({ length: 20 }, (_, at) =>
                takes.add('t1', at, stretch(10)),
              ),
              takes.end('t1', 20),
            ],
            { concurrency: 'unbounded' },
          );
          yield* Fiber.join(fiber);
          expect(seen.at(-1)).toEqual({ _tag: 'Done', text: '200' });
        }),
        // Every fiber yields every few steps, so the calls interleave.
      ).pipe(Effect.provideService(References.MaxOpsBeforeYield, 8)),
    ));

  it('never forgets a Take while it is watched, however long the model downloads', () =>
    timed(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Downloading');
          const takes = yield* makeTakes(stood.model);
          const { seen, fiber } = yield* watching(takes, 't1');
          yield* takes.add('t1', 0, stretch(100));
          yield* takes.end('t1', 1);
          yield* eventually(() =>
            expect(seen.at(-1)?._tag).toBe('Downloading'),
          );
          yield* TestClock.adjust(IDLE * 3);
          yield* SubscriptionRef.set(stood.now, { _tag: 'Ready' });
          yield* Fiber.join(fiber);
          expect(seen.at(-1)).toEqual({ _tag: 'Done', text: '100' });
        }),
      ),
    ));

  it('forgets a Take nobody watches or touches, and one watched again after starts afresh', () =>
    timed(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Ready');
          const takes = yield* makeTakes(stood.model);
          const first = yield* watching(takes, 't1');
          yield* takes.add('t1', 0, stretch(100));
          yield* eventually(() =>
            expect(first.seen.at(-1)).toEqual({ _tag: 'Heard', text: '100' }),
          );
          yield* Fiber.interrupt(first.fiber);
          yield* TestClock.adjust(IDLE + 2 * 60_000);
          const again = yield* watching(takes, 't1');
          yield* eventually(() =>
            expect(again.seen).toEqual([{ _tag: 'Heard', text: '' }]),
          );
        }),
      ),
    ));

  it('fails its watchers when hearing it breaks', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stood = yield* model('Ready', () =>
            Effect.die(new Error('The recognizer crashed')),
          );
          const takes = yield* makeTakes(stood.model);
          const { fiber } = yield* watching(takes, 't1');
          yield* takes.add('t1', 0, stretch(100));
          const exit = yield* Fiber.await(fiber);
          expect(exit).toMatchObject({
            _tag: 'Failure',
            cause: {
              reasons: [
                {
                  error: new TakeFailed({
                    message: 'Speech to Text stopped hearing this Take',
                  }),
                },
              ],
            },
          });
        }),
      ),
    ));

  it('finds the quietest moment', () => {
    const audio = new Float32Array(16_000).fill(0.5);
    audio.fill(0, 8_000, 9_000);
    const at = quietest(audio, 0, 16_000);
    expect(at).toBeGreaterThanOrEqual(8_000);
    expect(at).toBeLessThanOrEqual(9_000);
  });
});
