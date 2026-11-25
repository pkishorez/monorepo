import { STEPS, type Step, type Video } from '../../../video/library/schema.ts';
import { clock } from './time.ts';

/*
 * What a Video's record says, in words: its status (`transcribe 42%`,
 * `queued`, `failed at download`, `done`), its lengths, and a mark per
 * step.
 */

const percent = (progress: number | null) =>
  progress === null ? '' : ` ${Math.round(progress * 100)}%`;

export const statusOf = (video: Video) => {
  switch (video.state) {
    case 'queued':
      return 'queued';
    case 'done':
      return 'done';
    case 'failed':
      return `failed at ${video.error?.step ?? video.step ?? 'start'}`;
    case 'stopped':
      return video.step === null
        ? 'stopped'
        : `stopped at ${video.step}${percent(video.progress)}`;
    case 'running':
      return video.step === null
        ? 'starting'
        : `${video.step}${percent(video.progress)}`;
  }
};

/** Whether a worker has it, or will. */
export const isWorking = (video: Video) =>
  video.state === 'queued' || video.state === 'running';

/** `1:00 → 0:39` when done, the original's length before, `null` until info. */
export const lengthsOf = (video: Video) =>
  video.result !== null && video.duration !== null
    ? `${clock(video.duration)} → ${clock(video.result.duration)}`
    : video.duration === null
      ? null
      : clock(video.duration);

/** `34% shorter`, when done. */
export const shorterOf = (video: Video) =>
  video.result === null || video.duration === null || video.duration === 0
    ? null
    : `${Math.round((1 - video.result.duration / video.duration) * 100)}% shorter`;

export type Mark = 'done' | 'running' | 'stopped' | 'failed' | 'pending';

/** Each step, and how far it got. */
export const marksOf = (
  video: Video,
): ReadonlyArray<{ readonly step: Step; readonly mark: Mark }> =>
  STEPS.map((step) => ({
    step,
    mark: video.done.includes(step)
      ? 'done'
      : step !== video.step
        ? 'pending'
        : video.state === 'running'
          ? 'running'
          : video.state === 'failed'
            ? 'failed'
            : video.state === 'stopped'
              ? 'stopped'
              : 'pending',
  }));

/**
 * The step to name when there is room for one: the one under way, stopped
 * or failed, else the first not done, else the last; with its place, from 1.
 */
export const currentOf = (video: Video) => {
  const marks = marksOf(video);
  const at = marks.findIndex(
    ({ mark }) => mark !== 'done' && mark !== 'pending',
  );
  const next = marks.findIndex(({ mark }) => mark !== 'done');
  const index = at >= 0 ? at : next >= 0 ? next : marks.length - 1;
  return { ...marks[index]!, place: index + 1, of: marks.length };
};
