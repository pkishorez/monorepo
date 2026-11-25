import { join } from 'node:path';
import { Data, Effect } from 'effect';
import type {
  Event,
  EventStep,
  Files,
  Result,
  Strength,
} from '../library/index.ts';
import { readText, write, type Info } from './machine/index.ts';
import { learn, type About } from './text/index.ts';

/** One Video being made, as the worker hands it to the pipeline. */
export interface Job {
  readonly id: string;
  readonly url: string;
  readonly strength: Strength;
  /** `files.folder` is the Video's folder; its work is in `work/` there. */
  readonly files: Files;
  /** The skill folder: cut-rules.md, summary-rules.md, learnings.md. */
  readonly skill: string;
  /** The speech model's folder. */
  readonly model: string;
  /** Appends an Event, and folds step, progress and latest into the record. */
  readonly emit: (event: Omit<Event, 'at'>) => Effect.Effect<void>;
  readonly update: (patch: {
    readonly title?: string | null;
    readonly channel?: string | null;
    readonly duration?: number | null;
    readonly result?: Result;
  }) => Effect.Effect<void>;
}

/** A step could not finish; resuming runs it again. */
export class StepFailed extends Data.TaggedError('StepFailed')<{
  readonly message: string;
}> {}

/** The files of a Video's `work/` folder. */
export const workFiles = (job: Job) => {
  const work = join(job.files.folder, 'work');
  return {
    work,
    info: join(work, 'info.json'),
    audio: join(work, 'audio.pcm'),
    silences: join(work, 'silences.json'),
    pieces: join(work, 'pieces'),
    words: join(work, 'words.json'),
    sentences: join(work, 'sentences.json'),
    plan: join(work, 'plan.json'),
    claude: join(work, 'claude.json'),
    clips: join(work, 'clips'),
    render: join(work, 'render'),
  };
};

/** Says a line under `step`, or under `label` in the step column. */
export const say = (job: Job, step: EventStep, text: string, label?: string) =>
  job.emit(label === undefined ? { step, text } : { step, label, text });

/** Reports how far `step` is, 0..1, once per whole percent. */
export const progress = (job: Job, step: EventStep) => {
  let last = -1;
  return (fraction: number, text?: string) => {
    const percent = Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
    if (percent === last && text === undefined) return Effect.void;
    last = percent;
    const value = percent / 100;
    return job.emit(
      text === undefined
        ? { step, progress: value }
        : { step, text, progress: value },
    );
  };
};

/** Fails the step with `message`. */
export const fail = (message: string) =>
  Effect.fail(new StepFailed({ message }));

/** Seconds since `start` (from `Date.now()`). */
export const since = (start: number) => (Date.now() - start) / 1000;

/**
 * Appends what Claude learned to the skill's learnings.md, skipping
 * repeats, with an Event `learned: <text>` for each.
 */
export const remember = (
  job: Job,
  step: EventStep,
  learnings: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    if (learnings.length === 0) return;
    const path = join(job.skill, 'learnings.md');
    const before = yield* readText(path).pipe(Effect.orElseSucceed(() => ''));
    const { file, added } = learn(
      before,
      learnings,
      job.id,
      new Date().toISOString().slice(0, 10),
    );
    if (added.length === 0) return;
    yield* write(path, file);
    for (const text of added) yield* say(job, step, `learned: ${text}`);
  });

/** What Claude is told of the video, from `work/info.json`. */
export const aboutOf = (details: Info): About => ({
  title: details.title,
  channel: details.channel,
  description: details.description,
  chapters: details.chapters.map(({ title, start }) => ({ title, start })),
});

/** The skill file `name`, read fresh; learnings.md may not be there yet. */
export const skillFile = (job: Job, name: string) =>
  readText(join(job.skill, name)).pipe(
    name === 'learnings.md' ? Effect.orElseSucceed(() => '') : (read) => read,
  );
