import { Context, Effect, Layer, type Scope, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { describe, expect, it, vi } from 'vitest';
import { Recorder } from '../../recorder.ts';
import { CHUNK, microphone, type MicrophoneMessage } from '../index.ts';

/*
 * The Microphone fake as the Dictation sees it, through the real
 * Recorder: allowed at once, it records a made-up voice into one clip; a
 * chosen microphone gone falls back to the default, and it switches to
 * another into the same recording. Its inputs list the default first.
 */

type Fake = Runtime<typeof microphone.actor>;

const run = <A, E>(
  body: (
    fake: Fake,
    recorder: Recorder['Service'],
  ) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fake = yield* Runtime.scoped(microphone.actor);
        const built = yield* Layer.build(microphone.serve(fake));
        return yield* body(fake, Context.get(built, Recorder));
      }),
    ),
  );

const control = (fake: Fake, message: MicrophoneMessage) =>
  Effect.sync(() => void fake.root.send(message));

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
    run((fake, recorder) =>
      Effect.gen(function* () {
        const { heard, levels, clip } = yield* recordFor(recorder);
        expect(heard).toEqual({ name: 'Built-in Microphone', fellBack: false });
        expect(levels.every((level) => level > 0.3)).toBe(true);
        expect(clip.length % (CHUNK * 2)).toBe(0);
        expect(clip.length).toBeGreaterThanOrEqual(3 * CHUNK * 2);
        expect(fake.root.model).toMatchObject({
          recording: null,
          recordings: 1,
        });
      }),
    ));

  it('falls back to the default when the one chosen is gone, and records from one plugged in', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        const { heard } = yield* recordFor(recorder, 'mic-9');
        expect(heard).toEqual({ name: 'Built-in Microphone', fellBack: true });
        yield* control(fake, { _tag: 'PlugIn', name: '' });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const recording = yield* recorder.record('mic-2');
            expect(recording.heard.name).toBe('USB Microphone');
            yield* eventually(() =>
              expect(fake.root.model.recording).toBe('mic-2'),
            );
          }),
        );
        expect(fake.root.model.recording).toBeNull();
      }),
    ));

  it('switches to another microphone into the same recording', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'PlugIn', name: 'Yeti' });
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* recorder.record(null);
            const heard = yield* recorder.switchTo('mic-2');
            expect(heard).toEqual({ name: 'Yeti', fellBack: false });
            expect(fake.root.model.recording).toBe('mic-2');
          }),
        );
        expect(fake.root.model.recordings).toBe(1);
      }),
    ));

  it('lists its inputs, the default first, again as one is plugged in', () =>
    run((fake, recorder) =>
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
        yield* control(fake, { _tag: 'PlugIn', name: 'Yeti' });
        yield* eventually(() =>
          expect(seen.at(-1)).toEqual([
            'Default - Built-in Microphone',
            'Built-in Microphone',
            'Yeti',
          ]),
        );
      }),
    ));

  it('keeps nothing recording across a reload', () =>
    run((fake, recorder) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* recorder.record(null);
          expect(fake.root.model.recording).toBe('mic-1');
          const kept = microphone.kept(fake.snapshot).root.model;
          expect(kept.recording).toBeNull();
        }),
      ),
    ));
});
