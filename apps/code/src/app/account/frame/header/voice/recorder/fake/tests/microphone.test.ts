import { Context, Effect, Fiber, Layer, type Scope, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { describe, expect, it, vi } from 'vitest';
import { Recorder } from '../../recorder.ts';
import { CHUNK, microphone, type MicrophoneMessage } from '../index.ts';

/*
 * The Microphone fake as the Dictation sees it, through the real
 * Recorder: the first use waits for the person to allow it; allowed, it
 * records made-up PCM, loud or silent, into one clip; denied or blocked,
 * broken, or with nothing plugged in, it says why as the browser's
 * Recorder does; a chosen microphone gone falls back to the default, and
 * the one recording unplugged ends it. Its inputs list the default first.
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
  it('asks first, then records a loud voice into one clip', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        const recording = yield* Effect.forkChild(recordFor(recorder));
        yield* eventually(() => expect(fake.root.model.asking).toBe(true));
        yield* control(fake, { _tag: 'AllowMicrophone' });
        const { heard, levels, clip } = yield* Fiber.join(recording);
        expect(heard).toEqual({ name: 'Built-in Microphone', fellBack: false });
        expect(levels.every((level) => level > 0.3)).toBe(true);
        expect(clip.length % (CHUNK * 2)).toBe(0);
        expect(clip.length).toBeGreaterThanOrEqual(3 * CHUNK * 2);
        expect(fake.root.model).toMatchObject({
          permission: 'Allowed',
          recording: null,
          recordings: 1,
        });
      }),
    ));

  it('records silence when silent', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'AllowMicrophone' });
        yield* control(fake, { _tag: 'Silent' });
        const { levels, clip } = yield* recordFor(recorder);
        expect(levels.every((level) => level === 0)).toBe(true);
        expect(clip.every((byte) => byte === 0)).toBe(true);
      }),
    ));

  it('says why it cannot record, as the browser’s Recorder does', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        const why = () =>
          Effect.flip(Effect.scoped(recorder.record(null))).pipe(
            Effect.map(({ reason, blocked }) => ({ reason, blocked })),
          );
        yield* control(fake, { _tag: 'DenyMicrophone' });
        expect(yield* why()).toEqual({
          reason: 'The microphone is blocked for this site',
          blocked: true,
        });
        yield* control(fake, { _tag: 'AllowMicrophone' });
        yield* control(fake, { _tag: 'BlockUntilReload' });
        expect((yield* why()).blocked).toBe(true);
        // A reload ends it.
        expect(
          microphone.kept(fake.snapshot).root.model.untilReload.blocked,
        ).toBe(false);
      }),
    ));

  it('says when it is broken', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'AllowMicrophone' });
        yield* control(fake, { _tag: 'BreakMicrophone' });
        const { reason, blocked } = yield* Effect.flip(
          Effect.scoped(recorder.record(null)),
        );
        expect({ reason, blocked }).toEqual({
          reason: 'The microphone is in use by something else',
          blocked: false,
        });
      }),
    ));

  it('says when none is plugged in', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'AllowMicrophone' });
        yield* control(fake, { _tag: 'Unplug', name: '' });
        const { reason } = yield* Effect.flip(
          Effect.scoped(recorder.record(null)),
        );
        expect(reason).toBe('No microphone found');
      }),
    ));

  it('falls back to the default when the one chosen is gone, and ends as the one recording is unplugged', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'AllowMicrophone' });
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
            yield* control(fake, { _tag: 'Unplug', name: 'USB Microphone' });
            // The levels end, so the recording does.
            yield* Stream.runDrain(recording.levels);
          }),
        );
      }),
    ));

  it('switches to another microphone into the same recording', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'AllowMicrophone' });
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

  it('lists its inputs once allowed, the default first, again as one is plugged in', () =>
    run((fake, recorder) =>
      Effect.gen(function* () {
        const seen: Array<ReadonlyArray<string>> = [];
        yield* Effect.forkScoped(
          Stream.runForEach(recorder.inputs, (inputs) =>
            Effect.sync(() => void seen.push(inputs.map(({ label }) => label))),
          ),
        );
        yield* eventually(() => expect(fake.root.model.asking).toBe(true));
        expect(seen).toEqual([]);
        yield* control(fake, { _tag: 'AllowMicrophone' });
        yield* eventually(() =>
          expect(seen.at(-1)).toEqual([
            'Default - Built-in Microphone',
            'Built-in Microphone',
          ]),
        );
        yield* control(fake, { _tag: 'PlugIn', name: 'Yeti' });
        yield* control(fake, { _tag: 'MakeSystemDefault', name: 'Yeti' });
        yield* eventually(() =>
          expect(seen.at(-1)).toEqual([
            'Default - Yeti',
            'Built-in Microphone',
            'Yeti',
          ]),
        );
      }),
    ));
});
