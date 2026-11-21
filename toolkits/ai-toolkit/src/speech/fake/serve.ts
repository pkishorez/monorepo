import { Effect, Layer, Stream } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import { SAMPLE_RATE, Speech } from '../contract/index.js';
import type { SpeechHost } from '../capabilities/index.js';
import { speechOver } from '../front/index.js';
import type { SpeechFake, SpeechMessage, SpeechModel } from './actor.js';

/*
 * `Speech` over the running Speech fake: the real speech model and Takes
 * (`../front`) on a SpeechHost that reads and writes the fake's Model, so
 * enabling, downloading, failing, hearing and Takes timing out are the
 * real code's.
 *
 * 1. Disk      the wish and the model's files are the Model's `wished` and
 *              `installed`; removing them is a Message.
 * 2. Download  starts in the Model, then moves by itself a tenth at a time
 *              unless held; its progress is told as the Model moves, and it
 *              ends as a Control ends it, or once all of it is there.
 * 3. Hearing   reads the Model each time: never answering waits until it
 *              answers again; failing fails; nothing hears no words; else
 *              the text, whole or a few words per second of audio.
 */

/** How big the fake model is, in bytes: about Parakeet's. */
export const SPEECH_MODEL_BYTES = 480 * 1024 * 1024;

/** What a Take turns into unless told. */
export const HEARD_TEXT =
  'Add a dark mode toggle to the settings page, and keep the choice across reloads.';

/** How long a download that runs by itself waits between two tenths, in ms. */
const STEP_MS = 150;

export const speechFakeOver = (
  runtime: Runtime<typeof SpeechFake>,
): Layer.Layer<Speech> =>
  Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the Speech fake')),
    Layer.effect(
      Speech,
      Effect.gen(function* () {
        const root = runtime.root;
        const model = (): SpeechModel => root.model;
        const send = (message: SpeechMessage) =>
          Effect.sync(() => void root.send(message));
        const changes = runtime.changes.pipe(
          Stream.map((snapshot) => snapshot.root.model),
        );

        // 2. Download
        const runs = Effect.gen(function* () {
          for (;;) {
            yield* Effect.sleep(STEP_MS);
            const now = model();
            const running = now.downloading;
            if (running === null || running.ending !== null) return;
            if (now.downloadsHeld) continue;
            yield* send({
              _tag: 'Progressed',
              done: Math.min(
                running.total,
                running.done + Math.ceil(running.total / 10),
              ),
            });
          }
        });

        const install: SpeechHost['Service']['install'] = (progress) =>
          Effect.gen(function* () {
            yield* send({ _tag: 'Wished' });
            yield* send({ _tag: 'DownloadStarted', total: SPEECH_MODEL_BYTES });
            yield* Effect.forkScoped(runs);
            let told = -1;
            const ended = yield* changes.pipe(
              Stream.mapEffect((now) =>
                Effect.gen(function* () {
                  const running = now.downloading;
                  if (running === null)
                    return { _tag: 'Failed' as const, reason: 'Let go' };
                  if (running.done !== told) {
                    told = running.done;
                    yield* progress({
                      done: running.done,
                      total: running.total,
                    });
                  }
                  if (running.ending !== null) return running.ending;
                  return running.done >= running.total
                    ? { _tag: 'Finished' as const }
                    : null;
                }),
              ),
              Stream.filter((ending) => ending !== null),
              Stream.runHead,
            );
            if (ended._tag === 'Some' && ended.value._tag === 'Finished')
              return yield* send({ _tag: 'Downloaded' });
            yield* send({ _tag: 'DownloadLetGo' });
            return yield* Effect.fail(
              ended._tag === 'Some' && ended.value._tag === 'Failed'
                ? ended.value.reason
                : 'The download stopped',
            );
          }).pipe(
            Effect.onInterrupt(() => send({ _tag: 'DownloadLetGo' })),
            Effect.scoped,
          );

        // 3. Hearing
        const transcribe = (samples: Float32Array) =>
          Effect.gen(function* () {
            yield* send({ _tag: 'Heard' });
            const { hearing } = yield* Effect.orDie(
              root.until(({ model: now }) => now.hearing.answering),
            ).pipe(Effect.map(({ model: now }) => now));
            if (hearing.fails !== null)
              return yield* Effect.fail(hearing.fails);
            if (hearing.nothing) return '';
            const text = hearing.text || HEARD_TEXT;
            if (hearing.wordsPerSecond === 0) return text;
            const seconds = samples.length / SAMPLE_RATE;
            return text
              .split(/\s+/)
              .slice(0, Math.ceil(seconds * hearing.wordsPerSecond))
              .join(' ');
          });

        // 1. Disk
        return yield* speechOver({
          wished: Effect.sync(() => model().wished),
          installed: Effect.sync(() => model().installed),
          install,
          transcribe,
          remove: send({ _tag: 'Removed' }),
        });
      }),
    ),
  );
