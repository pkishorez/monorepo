import { Context, Effect, Fiber, Layer, type Scope, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import {
  Speech,
  type SpeechService,
  type SpeechToTextStatus,
  type TakeHeard,
} from '../../contract/index.js';
import {
  HEARD_TEXT,
  speech,
  SPEECH_MODEL_BYTES,
  type SpeechMessage,
} from '../index.js';

/*
 * The Speech fake as connect's code Plugin sees it: the real speech model
 * and Takes over it. Switched on, its download runs by itself, or as the
 * Controls move it; finished it is Ready, failed it says why. What a Take
 * turns into, how it is heard as it goes, and hearing that fails, hears
 * nothing or stops answering, are each a Control.
 */

type Fake = Runtime<typeof speech.actor>;

const run = <A, E>(
  body: (
    fake: Fake,
    service: SpeechService,
  ) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fake = yield* Runtime.scoped(speech.actor);
        const built = yield* Layer.build(speech.serve(fake));
        return yield* body(fake, Context.get(built, Speech));
      }),
    ),
  );

const control = (fake: Fake, message: SpeechMessage) =>
  Effect.sync(() => void fake.root.send(message));

/** The first status that passes `test`. */
const status = (
  service: SpeechService,
  test: (now: SpeechToTextStatus) => boolean,
) =>
  service.watch.pipe(
    Stream.filter(test),
    Stream.runHead,
    Effect.map((found) => (found._tag === 'Some' ? found.value : null)),
  );

/** Enabled, its download held then finished: Ready. */
const ready = (fake: Fake, service: SpeechService) =>
  Effect.gen(function* () {
    yield* control(fake, { _tag: 'HoldDownloads' });
    yield* service.enable;
    yield* status(service, (now) => now._tag === 'Downloading');
    yield* control(fake, { _tag: 'FinishDownload' });
    yield* status(service, (now) => now._tag === 'Ready');
  });

/** `seconds` of 16 kHz 16-bit PCM. */
const pcm = (seconds: number) => new Uint8Array(seconds * 16_000 * 2);

describe('the Speech fake, its download', () => {
  it('starts Off, and downloads by itself once switched on', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        const first = yield* status(service, () => true);
        yield* service.enable;
        const downloading = yield* status(
          service,
          (now) => now._tag === 'Downloading' && (now.done ?? 0) > 0,
        );
        yield* status(service, (now) => now._tag === 'Ready');
        return { first, downloading, disk: fake.root.model };
      }),
    );
    expect(found.first).toEqual({ _tag: 'Off' });
    expect(found.downloading).toMatchObject({ total: SPEECH_MODEL_BYTES });
    expect(found.disk).toMatchObject({
      wished: true,
      installed: true,
      downloading: null,
    });
  });

  it('moves a held download only as told, and fails it with the reason given', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'HoldDownloads' });
        yield* service.enable;
        yield* status(service, (now) => now._tag === 'Downloading');
        yield* control(fake, { _tag: 'DownloadTo', percent: 50 });
        const half = yield* status(
          service,
          (now) => now._tag === 'Downloading' && now.done > 0,
        );
        yield* control(fake, { _tag: 'FailDownload', reason: 'No network' });
        const failed = yield* status(service, (now) => now._tag === 'Failed');
        yield* control(fake, { _tag: 'FailDownload', reason: 'Disk full' });
        yield* service.enable;
        const again = yield* status(
          service,
          (now) => now._tag === 'Failed' && now.reason === 'Disk full',
        );
        yield* service.enable;
        yield* status(service, (now) => now._tag === 'Downloading');
        yield* control(fake, { _tag: 'DownloadTo', percent: 100 });
        const done = yield* status(service, (now) => now._tag === 'Ready');
        return { half, failed, again, done };
      }),
    );
    expect(found.half).toEqual({
      _tag: 'Downloading',
      done: SPEECH_MODEL_BYTES / 2,
      total: SPEECH_MODEL_BYTES,
    });
    expect(found.failed).toEqual({ _tag: 'Failed', reason: 'No network' });
    expect(found.again).toEqual({ _tag: 'Failed', reason: 'Disk full' });
    expect(found.done).toEqual({ _tag: 'Ready' });
  });

  it('switched off, deletes the model; a reload keeps no download running', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        yield* ready(fake, service);
        yield* service.disable;
        yield* status(service, (now) => now._tag === 'Off');
        const off = fake.root.model;
        yield* control(fake, { _tag: 'HoldDownloads' });
        yield* service.enable;
        yield* status(service, (now) => now._tag === 'Downloading');
        return { off, kept: speech.kept(fake.snapshot).root.model };
      }),
    );
    expect(found.off).toMatchObject({ wished: false, installed: false });
    expect(found.kept).toMatchObject({ wished: true, downloading: null });
  });
});

describe('the Speech fake, hearing', () => {
  it('turns audio into the text told, nothing, or a failure', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        yield* ready(fake, service);
        const plain = yield* service.transcribe(pcm(1));
        yield* control(fake, { _tag: 'Hear', text: 'ship it' });
        const told = yield* service.transcribe(pcm(1));
        yield* control(fake, { _tag: 'HearNothing' });
        const nothing = yield* service.transcribe(pcm(1));
        yield* control(fake, { _tag: 'FailHearing', reason: 'Model broke' });
        const failed = yield* Effect.flip(service.transcribe(pcm(1)));
        return { plain, told, nothing, failed };
      }),
    );
    expect(found.plain).toBe(HEARD_TEXT);
    expect(found.told).toBe('ship it');
    expect(found.nothing).toBe('');
    expect(found.failed).toMatchObject({
      _tag: 'TranscriptionFailed',
      message: 'Model broke',
    });
  });

  it('waits while it stops answering, and answers once told to again', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        yield* ready(fake, service);
        yield* control(fake, { _tag: 'StopAnswering' });
        const fiber = yield* Effect.forkChild(service.transcribe(pcm(1)));
        yield* Effect.sleep('50 millis');
        const waiting = fiber.pollUnsafe() === undefined;
        yield* control(fake, { _tag: 'AnswerAgain' });
        return { waiting, text: yield* Fiber.join(fiber) };
      }),
    );
    expect(found).toEqual({ waiting: true, text: HEARD_TEXT });
  });

  it('hears a Take as it goes, a few words a second, then whole', async () => {
    const heard = await run((fake, service) =>
      Effect.gen(function* () {
        yield* ready(fake, service);
        yield* control(fake, { _tag: 'HearAsItGoes', wordsPerSecond: 2 });
        const seen: Array<TakeHeard> = [];
        const watching = yield* Effect.forkChild(
          Stream.runForEach(service.watchTake('take-1'), (now) =>
            Effect.sync(() => void seen.push(now)),
          ),
        );
        yield* service.addTakeAudio('take-1', 0, pcm(1));
        yield* Effect.sleep('30 millis');
        yield* service.addTakeAudio('take-1', 1, pcm(1));
        yield* service.endTake('take-1', 2);
        yield* Fiber.join(watching);
        return seen;
      }),
    );
    expect(heard.at(-1)).toEqual({ _tag: 'Done', text: 'Add a dark mode' });
    expect(heard).toContainEqual({ _tag: 'Heard', text: 'Add a' });
  });

  it('switches itself on for a Take, showing the download first', async () => {
    const heard = await run((fake, service) =>
      Effect.gen(function* () {
        const seen: Array<TakeHeard['_tag']> = [];
        const watching = yield* Effect.forkChild(
          Stream.runForEach(service.watchTake('take-1'), (now) =>
            Effect.sync(() => void seen.push(now._tag)),
          ),
        );
        yield* service.addTakeAudio('take-1', 0, pcm(1));
        yield* service.endTake('take-1', 1);
        yield* Fiber.join(watching);
        return { seen, wished: fake.root.model.wished };
      }),
    );
    expect(heard.seen).toContain('Downloading');
    expect(heard.seen.indexOf('Downloading')).toBeLessThan(
      heard.seen.indexOf('Done'),
    );
    expect(heard.wished).toBe(true);
  });
});
