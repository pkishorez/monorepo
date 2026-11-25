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
 * and Takes over it. Switched on, its download runs by itself; finished
 * it is Ready. What a Take turns into is its one Control.
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

/** Enabled, its download run to the end: Ready. */
const ready = (service: SpeechService) =>
  Effect.gen(function* () {
    yield* service.enable;
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

  it('switched off, deletes the model; a reload keeps no download running', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        yield* ready(service);
        yield* service.disable;
        yield* status(service, (now) => now._tag === 'Off');
        const off = fake.root.model;
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
  it('turns audio into a plain sentence, or the text told', async () => {
    const found = await run((fake, service) =>
      Effect.gen(function* () {
        yield* ready(service);
        const plain = yield* service.transcribe(pcm(1));
        yield* control(fake, { _tag: 'Hear', text: 'ship it' });
        const told = yield* service.transcribe(pcm(1));
        return { plain, told, heard: fake.root.model.heard };
      }),
    );
    expect(found).toEqual({ plain: HEARD_TEXT, told: 'ship it', heard: 2 });
  });

  it('switches itself on for a Take, showing the download first', async () => {
    const heard = await run((fake, service) =>
      Effect.gen(function* () {
        const seen: Array<TakeHeard> = [];
        const watching = yield* Effect.forkChild(
          Stream.runForEach(service.watchTake('take-1'), (now) =>
            Effect.sync(() => void seen.push(now)),
          ),
        );
        yield* service.addTakeAudio('take-1', 0, pcm(1));
        yield* service.endTake('take-1', 1);
        yield* Fiber.join(watching);
        return {
          seen: seen.map(({ _tag }) => _tag),
          done: seen.at(-1),
          wished: fake.root.model.wished,
        };
      }),
    );
    expect(heard.seen).toContain('Downloading');
    expect(heard.seen.indexOf('Downloading')).toBeLessThan(
      heard.seen.indexOf('Done'),
    );
    expect(heard.done).toEqual({ _tag: 'Done', text: HEARD_TEXT });
    expect(heard.wished).toBe(true);
  });
});
