import type { Range } from '../../library/index.ts';

/** The longest piece of audio heard at once, in seconds. */
export const LONGEST_PIECE = 20;

/** A cut never leaves a piece shorter than this, in seconds. */
const SHORTEST_PIECE = 10;

/** The window the quietest stretch is looked for in, in seconds. */
const QUIET_WINDOW = 0.2;

/** How finely the quietest window is searched, in seconds. */
const QUIET_STEP = 0.01;

/**
 * Where audio of `duration` seconds is cut into pieces of at most
 * `longest` seconds. Each cut lands in the middle of the silence nearest the
 * limit; a silence that runs past the limit is cut at the limit. With no
 * silence between `shortest` and `longest` seconds into the piece, the cut is
 * at `quietest(from, to)`, the middle of the quietest stretch there.
 */
export const pieces = (
  duration: number,
  silences: ReadonlyArray<Range>,
  quietest: (from: number, to: number) => number,
  longest = LONGEST_PIECE,
  shortest = SHORTEST_PIECE,
): Array<Range> => {
  const found: Array<Range> = [];
  let start = 0;
  while (duration - start > longest) {
    const low = start + shortest;
    const limit = start + longest;
    let cut: number | null = null;
    for (const silence of silences) {
      if (silence.end <= low || silence.start >= limit) continue;
      const middle = (silence.start + silence.end) / 2;
      const at = Math.min(limit, Math.max(low, middle));
      if (cut === null || at > cut) cut = at;
    }
    const at = cut ?? quietest(low, limit);
    found.push({ start, end: at });
    start = at;
  }
  if (duration - start > 0) found.push({ start, end: duration });
  return found;
};

/**
 * The middle, in seconds, of the quietest `window` seconds between `from`
 * and `to` of 16-bit `pcm` at `rate`: the least energy, searched every 10 ms.
 */
export const quietest = (
  pcm: Int16Array,
  rate: number,
  from: number,
  to: number,
  window = QUIET_WINDOW,
): number => {
  const step = Math.max(1, Math.round(QUIET_STEP * rate));
  const first = Math.max(0, Math.floor(from * rate));
  const last = Math.min(pcm.length, Math.ceil(to * rate));
  const blocks: Array<number> = [];
  for (let at = first; at < last; at += step) {
    let energy = 0;
    const end = Math.min(last, at + step);
    for (let i = at; i < end; i++) energy += pcm[i]! * pcm[i]!;
    blocks.push(energy);
  }
  const span = Math.max(1, Math.round(window / QUIET_STEP));
  if (blocks.length <= span) return (from + to) / 2;
  let sum = 0;
  for (let i = 0; i < span; i++) sum += blocks[i]!;
  let best = sum;
  let bestAt = 0;
  for (let i = span; i < blocks.length; i++) {
    sum += blocks[i]! - blocks[i - span]!;
    if (sum < best) {
      best = sum;
      bestAt = i - span + 1;
    }
  }
  return (first + (bestAt + span / 2) * step) / rate;
};

/** 16-bit samples as floats in [-1, 1], as a Recognizer hears them. */
export const toFloat = (pcm: Int16Array): Float32Array => {
  const samples = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i]! / 32768;
  return samples;
};

/** How long, in sample frames, the sound fades out and back in at a cut. */
export const FADE_FRAMES = 240;

/**
 * Keeps the sample frames of interleaved float audio inside `kept`
 * (`[first, end)` frame indices, in order), fed in chunks as it is decoded.
 * Each kept stretch fades in and out over `fade` frames, so a cut never
 * clicks, and the length stays exact to the frame.
 */
export const sampleCutter = (
  kept: ReadonlyArray<readonly [number, number]>,
  channels: number,
  fade = FADE_FRAMES,
) => {
  let position = 0;
  let index = 0;
  return (chunk: Float32Array): Float32Array => {
    const frames = Math.floor(chunk.length / channels);
    const out = new Float32Array(chunk.length);
    let written = 0;
    for (let frame = 0; frame < frames; frame++) {
      const at = position + frame;
      while (index < kept.length && kept[index]![1] <= at) index++;
      const range = kept[index];
      if (range === undefined || at < range[0]) continue;
      const edge = Math.min(at - range[0], range[1] - 1 - at);
      const gain =
        edge >= fade
          ? 1
          : 0.5 - 0.5 * Math.cos((Math.PI * (edge + 0.5)) / fade);
      for (let channel = 0; channel < channels; channel++)
        out[written++] = chunk[frame * channels + channel]! * gain;
    }
    position += frames;
    return out.subarray(0, written);
  };
};
