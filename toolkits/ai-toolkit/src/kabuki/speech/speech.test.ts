import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context, Effect, Fiber, Layer, Stream } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeFakeSpeech,
  type FakeSpeech,
} from '../../services/speech/fake/index.js';
import { Speech, type SpeechToTextStatus } from './index.js';

/*
 * Speech to Text's front door over the fake model: switched on, it keeps
 * the wish and downloads; Ready, it transcribes; off, it deletes it all;
 * and a restart carries on from what is on disk.
 */

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});
const dataFolder = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-speech-'));
  folders.push(made);
  return join(made, 'speech-to-text');
};

const eventually = (assertion: () => void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 5_000, interval: 10 }));

/** Speech over `fake` in `folder`, for as long as the Scope, and every status it showed. */
const start = (fake: FakeSpeech, folder: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      Speech.layer({ folder }).pipe(Layer.provide(fake.layer)),
    );
    const speech = Context.get(context, Speech);
    const seen: Array<SpeechToTextStatus> = [];
    const watching = yield* Effect.forkScoped(
      Stream.runForEach(speech.watch, (status) =>
        Effect.sync(() => void seen.push(status)),
      ),
    );
    const now = () => seen.at(-1);
    return { speech, seen, now, watching };
  });

/** Four samples of 16-bit PCM. */
const clip = new Uint8Array(8);

describe('Speech to Text', () => {
  it('starts Off, downloads when enabled, showing bytes of total, then transcribes with the model loaded once', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const folder = dataFolder();
          const fake = makeFakeSpeech();
          fake.hold();
          const { speech, now } = yield* start(fake, folder);
          yield* eventually(() => expect(now()).toEqual({ _tag: 'Off' }));

          yield* speech.enable;
          yield* eventually(() =>
            expect(now()).toEqual({
              _tag: 'Downloading',
              done: 50,
              total: 100,
            }),
          );
          expect(existsSync(join(folder, 'on'))).toBe(true);
          fake.release();
          yield* eventually(() => expect(now()).toEqual({ _tag: 'Ready' }));

          expect(yield* speech.transcribe(clip)).toBe('heard 4 samples');
          expect(yield* speech.transcribe(clip)).toBe('heard 4 samples');
          expect(fake.loads()).toBe(1);
        }),
      ),
    ));

  it('answers SpeechToTextNotReady until Ready, and TranscriptionFailed for audio that is not 16-bit', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fake = makeFakeSpeech();
          fake.hold();
          const { speech, now } = yield* start(fake, dataFolder());
          const failure = (pcm: Uint8Array) =>
            Effect.flip(speech.transcribe(pcm));
          expect(yield* failure(clip)).toMatchObject({
            _tag: 'SpeechToTextNotReady',
            state: 'Off',
          });
          yield* speech.enable;
          yield* eventually(() => expect(now()?._tag).toBe('Downloading'));
          expect(yield* failure(clip)).toMatchObject({
            _tag: 'SpeechToTextNotReady',
            state: 'Downloading',
          });
          fake.release();
          yield* eventually(() => expect(now()?._tag).toBe('Ready'));
          expect(yield* failure(new Uint8Array(3))).toMatchObject({
            _tag: 'TranscriptionFailed',
          });
          expect(fake.loads()).toBe(0);
        }),
      ),
    ));

  it('shows Failed with the reason, and tries again when enabled again', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fake = makeFakeSpeech();
          fake.failNext('the network is down');
          const { speech, now } = yield* start(fake, dataFolder());
          yield* eventually(() => expect(now()?._tag).toBe('Off'));
          yield* speech.enable;
          yield* eventually(() =>
            expect(now()).toEqual({
              _tag: 'Failed',
              reason: 'the network is down',
            }),
          );
          expect(yield* Effect.flip(speech.transcribe(clip))).toMatchObject({
            state: 'Failed',
          });
          yield* speech.enable;
          yield* eventually(() => expect(now()).toEqual({ _tag: 'Ready' }));
          expect(fake.installs()).toBe(2);
        }),
      ),
    ));

  it('downloads again after a restart while the wish is kept, and starts Ready once the model is there', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const folder = dataFolder();
        const fake = makeFakeSpeech();
        fake.hold();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { speech, now } = yield* start(fake, folder);
            yield* eventually(() => expect(now()?._tag).toBe('Off'));
            yield* speech.enable;
            yield* eventually(() => expect(now()?._tag).toBe('Downloading'));
          }),
        );
        fake.release();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { seen, now } = yield* start(fake, folder);
            yield* eventually(() => expect(now()?._tag).toBe('Ready'));
            expect(seen[0]?._tag).toBe('Downloading');
          }),
        );
        expect(fake.installs()).toBe(2);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { seen, now } = yield* start(fake, folder);
            yield* eventually(() => expect(now()?._tag).toBe('Ready'));
            expect(seen).toEqual([{ _tag: 'Ready' }]);
          }),
        );
        expect(fake.installs()).toBe(2);
      }),
    ));

  it('deletes the model and the wish when disabled, even mid-download, and stays Off after a restart', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const folder = dataFolder();
        const fake = makeFakeSpeech();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { speech, now } = yield* start(fake, folder);
            yield* eventually(() => expect(now()?._tag).toBe('Off'));
            yield* speech.enable;
            yield* eventually(() => expect(now()?._tag).toBe('Ready'));
            expect(yield* speech.transcribe(clip)).toBe('heard 4 samples');

            yield* speech.disable;
            yield* eventually(() => expect(existsSync(folder)).toBe(false));
            expect(now()).toEqual({ _tag: 'Off' });

            fake.hold();
            yield* speech.enable;
            yield* eventually(() => expect(now()?._tag).toBe('Downloading'));
            yield* speech.disable;
            yield* eventually(() => expect(existsSync(folder)).toBe(false));
            expect(now()).toEqual({ _tag: 'Off' });
            fake.release();
          }),
        );
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { speech, now, watching } = yield* start(fake, folder);
            yield* eventually(() => expect(now()).toEqual({ _tag: 'Off' }));
            expect(yield* Effect.flip(speech.transcribe(clip))).toMatchObject({
              state: 'Off',
            });
            yield* Fiber.interrupt(watching);
          }),
        );
      }),
    ));
});
