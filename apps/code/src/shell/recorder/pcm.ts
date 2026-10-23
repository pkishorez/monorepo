/*
 * Microphone audio as Speech to Text takes it: one channel at 16 kHz, each
 * sample 16-bit signed. `pcm` is handed each block of every channel the
 * microphone gives, at its own rate, and gives back the chunks it
 * completes, each with how loud it was. It runs inside the AudioWorklet,
 * which carries its source text, so it reaches nothing outside itself.
 */

/** One stretch of the clip, and how loud it was, 0 to 1. */
export interface Chunk {
  readonly samples: Int16Array;
  readonly level: number;
}

/**
 * Takes blocks at `rate` and gives a Chunk each time `size` samples at
 * 16 kHz are complete. The channels are averaged into one; each sample out
 * is the mean of the samples in it spans, which keeps speech and drops what
 * 16 kHz cannot carry.
 */
export function pcm(rate: number, size: number) {
  const step = rate / 16000;
  let buffer = new Int16Array(size);
  let filled = 0;
  let sum = 0;
  let count = 0;
  let squares = 0;
  // Where the input is, and where the next sample out ends, in input samples.
  let position = 0;
  let next = step;
  return (channels: ReadonlyArray<Float32Array>): Array<Chunk> => {
    const done: Array<Chunk> = [];
    const first = channels[0];
    if (first === undefined) return done;
    for (let at = 0; at < first.length; at++) {
      let mono = 0;
      for (const channel of channels) mono += channel[at] ?? 0;
      mono /= channels.length;
      sum += mono;
      count++;
      position++;
      while (position >= next) {
        const mean = count === 0 ? 0 : sum / count;
        const clamped = Math.max(-1, Math.min(1, mean));
        buffer[filled++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        squares += clamped * clamped;
        sum = 0;
        count = 0;
        next += step;
        if (filled === size) {
          // As loud as it sounds: the root of its mean power, raised.
          const level = Math.min(1, Math.sqrt(Math.sqrt(squares / size)) * 1.5);
          done.push({ samples: buffer, level });
          buffer = new Int16Array(size);
          filled = 0;
          squares = 0;
        }
      }
    }
    return done;
  };
}

/** The clip as `transcribe` takes it: every chunk in order, little-endian. */
export const clipOf = (chunks: ReadonlyArray<Int16Array>): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const clip = new Uint8Array(length * 2);
  const view = new DataView(clip.buffer);
  let at = 0;
  for (const chunk of chunks)
    for (const sample of chunk) {
      view.setInt16(at, sample, true);
      at += 2;
    }
  return clip;
};
