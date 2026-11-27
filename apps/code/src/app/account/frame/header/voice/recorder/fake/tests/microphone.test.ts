import { Context, Effect, Layer, type Scope, Stream } from 'effect';
import { FakeWorld } from '@kestack/kabuki/fake';
import { describe, expect, it, vi } from 'vitest';
import { Recorder } from '../../recorder.ts';
import { microphone } from '../index.ts';
import { CHUNK } from '../sound.ts';

/*
 * The Microphone fake as the Dictation sees it, through the real
 * Recorder: allowed at once, it records a made-up voice into one clip; a
 * chosen microphone gone falls back to the default, and it switches to
 * another into the same recording. Its inputs list the default first.
 */

const worldOf = () => FakeWorld.make([microphone]);
type World = ReturnType<typeof worldOf>;

const run = <A, E>(
  body: (
    world: World,
    recorder: Recorder['Service'],
  ) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const world = worldOf();
        const built = yield* Layer.build(world.layer);
        return yield* body(world, Context.get(built, Recorder));
      }),
    ),
  );

const plugIn = (world: World, name: string) =>
  world.control('microphone', 'PlugIn', { name });

const eventually = (assertion: () => void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 3_000, interval: 10 }));

/** Records from `chosen` for a few chunks, and gives what was heard, the levels and the clip. */
const recordFor = (
  recorder: Recorder['Service'],
  chosen: string | null = null,
) =>
  Effect.gen(function* () {
    const { heard, levels } = yield* Effect.scoped(
      Effect.gen(function* () {
        const recording = yield* recorder.record(chosen);
        const first = yield* Stream.runCollect(
          Stream.take(recording.levels, 3),
        );
        return { heard: recording.heard, levels: first };
      }),
    );
    return { heard, levels, clip: yield* recorder.clip };
  });

describe('the Microphone fake', () => {
  it('records a voice into one clip, allowed at once', () =>
    run((_, recorder) =>
      Effect.gen(function* () {
        const { heard, levels, clip } = yield* recordFor(recorder);
        expect(heard).toEqual({ name: 'Built-in Microphone', fellBack: false });
        expect(levels.every((level) => level > 0.3)).toBe(true);
        expect(clip.length % (CHUNK * 2)).toBe(0);
        expect(clip.length).toBeGreaterThanOrEqual(3 * CHUNK * 2);
      }),
    ));

  it('falls back to the default when the one chosen is gone, and records from one plugged in', () =>
    run((world, recorder) =>
      Effect.gen(function* () {
        const gone = yield* recordFor(recorder, 'mic-9');
        expect(gone.heard).toEqual({
          name: 'Built-in Microphone',
          fellBack: true,
        });
        yield* plugIn(world, '');
        const plugged = yield* recordFor(recorder, 'mic-2');
        expect(plugged.heard).toEqual({
          name: 'USB Microphone',
          fellBack: false,
        });
      }),
    ));

  it('switches to another microphone into the same recording', () =>
    run((world, recorder) =>
      Effect.gen(function* () {
        yield* plugIn(world, 'Yeti');
        yield* Effect.scoped(
          Effect.gen(function* () {
            const recording = yield* recorder.record(null);
            yield* Stream.runDrain(Stream.take(recording.levels, 2));
            const heard = yield* recorder.switchTo('mic-2');
            expect(heard).toEqual({ name: 'Yeti', fellBack: false });
            yield* Stream.runDrain(Stream.take(recording.levels, 2));
          }),
        );
        // One clip: the chunks heard before the switch and after it.
        const clip = yield* recorder.clip;
        expect(clip.length).toBeGreaterThanOrEqual(4 * CHUNK * 2);
        expect(yield* recorder.switchTo('mic-1')).toBeNull();
      }),
    ));

  it('lists its inputs, the default first, again as one is plugged in', () =>
    run((world, recorder) =>
      Effect.gen(function* () {
        const seen: Array<ReadonlyArray<string>> = [];
        yield* Effect.forkScoped(
          Stream.runForEach(recorder.inputs, (inputs) =>
            Effect.sync(() => void seen.push(inputs.map(({ label }) => label))),
          ),
        );
        yield* eventually(() =>
          expect(seen.at(-1)).toEqual([
            'Default - Built-in Microphone',
            'Built-in Microphone',
          ]),
        );
        yield* plugIn(world, 'Yeti');
        yield* eventually(() =>
          expect(seen.at(-1)).toEqual([
            'Default - Built-in Microphone',
            'Built-in Microphone',
            'Yeti',
          ]),
        );
      }),
    ));
});
