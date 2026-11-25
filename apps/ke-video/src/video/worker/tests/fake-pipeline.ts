import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Data, Effect, Layer } from 'effect';
import type { Step } from '../../library/index.ts';
import type { Job, Requirement } from '../run.ts';

/*
 * A pipeline for tests, with the exports of src/video/pipeline: each step
 * logs a line and four quarters of progress. Files in $KE_VIDEO_HOME steer
 * it: while `hold-<step>` exists that step waits, and with `fail-<step>`
 * it fails. KE_VIDEO_FAKE_MISSING names a requirement it reports missing.
 */

export class StepFailed extends Data.TaggedError('StepFailed')<{
  readonly message: string;
}> {}

const home = () => process.env['KE_VIDEO_HOME'] ?? '';

export const services = Layer.empty;

export const requirements = Effect.sync((): ReadonlyArray<Requirement> =>
  ['yt-dlp', 'ffmpeg', 'ffprobe', 'claude'].map((name) => ({
    name,
    ok: name !== process.env['KE_VIDEO_FAKE_MISSING'],
    install: `brew install ${name}`,
  })),
);

export const run = (step: Step, job: Job) =>
  Effect.gen(function* () {
    if (step === 'info')
      yield* job.update({
        title: 'A fake talk',
        channel: 'Fakes',
        duration: 600,
      });
    yield* job.emit({ step, text: `${step} begins` });
    for (const quarter of [0.25, 0.5]) {
      yield* Effect.sleep('5 millis');
      yield* job.emit({ step, progress: quarter });
    }
    while (existsSync(join(home(), `hold-${step}`)))
      yield* Effect.sleep('20 millis');
    if (existsSync(join(home(), `fail-${step}`)))
      return yield* new StepFailed({ message: `${step} broke` });
    for (const quarter of [0.75, 1]) {
      yield* Effect.sleep('5 millis');
      yield* job.emit({ step, progress: quarter });
    }
    if (step === 'summary')
      yield* job.update({
        result: {
          duration: 330,
          removed: { silence: 120, fillers: 30, ads: 90, fillerTalk: 30 },
          cuts: 42,
        },
      });
  });
