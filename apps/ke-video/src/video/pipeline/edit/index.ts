/*
 * The arithmetic of a short video, with no files and no programs: where the
 * audio is cut into pieces for listening, how words become sentences, the
 * plan of what is kept and why the rest goes, and where a moment of the
 * original lands in the short video.
 */
export { pieces, quietest, sampleCutter, toFloat } from './audio.ts';
export {
  batches,
  frames,
  PAUSE_LIMITS,
  plan,
  totals,
  type Cut,
  type Plan,
} from './plan.ts';
export {
  lines,
  sentences,
  shortTime,
  trimmed,
  type Sentence,
  type Word,
} from './words.ts';
