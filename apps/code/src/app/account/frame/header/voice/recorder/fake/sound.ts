import type { Chunk } from '../pcm.ts';

/*
 * What the Microphone fake hears, made up: chunks as the browser's
 * AudioWorklet posts them (`../browser/worklet.ts`), one channel at
 * 16 kHz, 16-bit signed, `CHUNK` samples each, with how loud each was by
 * the same measure. Loud is a voice's worth: two tones rising and falling
 * a few times a second, as syllables do, never quite still; silent is nothing at all.
 */

/** Samples per chunk, as the AudioWorklet posts them: about an eighth of a second. */
export const CHUNK = 2048;

/** Samples per second. */
const RATE = 16_000;

/** How long one chunk lasts, in ms. */
export const CHUNK_MS = (CHUNK / RATE) * 1000;

/** The `index`th chunk of a recording, loud or silent. */
export const chunkOf = (index: number, loud: boolean): Chunk => {
  const samples = new Int16Array(CHUNK);
  if (!loud) return { samples, level: 0 };
  let squares = 0;
  for (let at = 0; at < CHUNK; at++) {
    const t = (index * CHUNK + at) / RATE;
    // Syllables: three a second, each rising and falling, never quite still.
    const syllable = 0.35 + 0.65 * Math.max(0, Math.sin(2 * Math.PI * 3 * t));
    const voice =
      0.6 * Math.sin(2 * Math.PI * 180 * t) +
      0.4 * Math.sin(2 * Math.PI * 360 * t);
    const sample = 0.4 * syllable * voice;
    squares += sample * sample;
    samples[at] = Math.round(sample * 0x7fff);
  }
  // As loud as it sounds, as `pcm` measures it.
  const level = Math.min(1, Math.sqrt(Math.sqrt(squares / CHUNK)) * 1.5);
  return { samples, level };
};
