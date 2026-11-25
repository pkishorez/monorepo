import { Effect, Layer } from 'effect';
import type { Step } from '../library/index.ts';
import { cleanUp } from './clean-up.ts';
import { StepFailed, workFiles, type Job } from './job.ts';
import {
  capture,
  claude,
  ears,
  folder,
  type Claude,
  type Ears,
  type Failed,
} from './machine/index.ts';
import { render, summary, transcripts } from './output.ts';
import { audio, download, info, transcribe } from './source.ts';

/** What the steps need from outside: Claude and the speech model. */
export type PipelineServices = Claude | Ears;

const steps: Record<
  Step,
  (job: Job) => Effect.Effect<void, StepFailed | Failed, PipelineServices>
> = {
  info,
  download,
  audio,
  transcribe,
  'clean-up': cleanUp,
  render,
  transcripts,
  summary,
};

/**
 * Runs one step of a Job. Interrupted, the programs it started are
 * stopped; run again, it starts over from what is whole on disk.
 */
export const run = (
  step: Step,
  job: Job,
): Effect.Effect<void, StepFailed, PipelineServices> =>
  Effect.gen(function* () {
    yield* folder(workFiles(job).work);
    yield* steps[step](job);
  }).pipe(
    Effect.mapError((error) =>
      error._tag === 'StepFailed'
        ? error
        : new StepFailed({ message: error.message }),
    ),
  );

/** Claude Code for one-shot prompts, and Parakeet for speech. */
export const services: Layer.Layer<PipelineServices> = Layer.mergeAll(
  claude,
  ears,
);

/** A program ke-video needs, whether it runs here, and how to install it. */
export interface Requirement {
  readonly name: string;
  readonly ok: boolean;
  readonly install: string;
}

const NEEDED = [
  { name: 'yt-dlp', args: ['--version'], install: 'brew install yt-dlp' },
  { name: 'ffmpeg', args: ['-version'], install: 'brew install ffmpeg' },
  { name: 'ffprobe', args: ['-version'], install: 'brew install ffmpeg' },
  {
    name: 'claude',
    args: ['--version'],
    install:
      'npm install -g @anthropic-ai/claude-code, then run claude and sign in',
  },
] as const;

/** yt-dlp, ffmpeg, ffprobe and claude: each found and running, or how to install it. */
export const requirements: Effect.Effect<ReadonlyArray<Requirement>> =
  Effect.forEach(
    NEEDED,
    (needed) =>
      capture(needed.name, needed.args).pipe(
        Effect.map((ended) => ended.code === 0),
        Effect.orElseSucceed(() => false),
        Effect.map((ok) => ({
          name: needed.name,
          ok,
          install: needed.install,
        })),
      ),
    { concurrency: 'unbounded' },
  );
