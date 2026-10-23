import { describe, expect, it } from 'vitest';
import { clipOf, pcm } from './pcm.ts';
import { PROCESSOR, source } from './worklet.ts';

/*
 * What the AudioWorklet makes of the microphone: every channel averaged
 * into one, brought down to 16 kHz, in chunks of the size asked for, and
 * the clip as `transcribe` takes it, little-endian. The AudioWorklet's
 * own source text carries `pcm` whole, so it runs there on its own.
 */

const block = (length: number, value: number) =>
  new Float32Array(length).fill(value);

describe('pcm', () => {
  it('averages the channels and brings 48 kHz down to 16 kHz', () => {
    const chunks = pcm(48000, 4);
    // 12 samples at 48 kHz are 4 at 16 kHz: one whole chunk.
    const [chunk, ...rest] = chunks([block(12, 0.5), block(12, 0)]);
    expect(rest).toEqual([]);
    expect([...chunk!.samples]).toEqual([8191, 8191, 8191, 8191]);
    expect(chunk!.level).toBeGreaterThan(0);
  });

  it('carries what is left of a block into the next, at a rate that does not divide', () => {
    const chunks = pcm(44100, 441);
    const heard = [
      ...chunks([block(600, -1)]),
      ...chunks([block(600, -1)]),
      ...chunks([block(10, -1)]),
    ];
    // 1210 samples at 44.1 kHz are 439 at 16 kHz: no chunk yet.
    expect(heard).toEqual([]);
    const [chunk] = chunks([block(10, -1)]);
    expect(chunk!.samples).toHaveLength(441);
    expect(chunk!.samples.every((sample) => sample === -32768)).toBe(true);
    expect(chunk!.level).toBe(1);
  });

  it('is silent at zero', () => {
    const [chunk] = pcm(16000, 3)([block(3, 0)]);
    expect([...chunk!.samples]).toEqual([0, 0, 0]);
    expect(chunk!.level).toBe(0);
  });

  it('keeps the clip as 16-bit little-endian, chunk after chunk', () => {
    const clip = clipOf([Int16Array.of(1, -2), Int16Array.of(0x1234)]);
    expect([...clip]).toEqual([1, 0, 0xfe, 0xff, 0x34, 0x12]);
  });

  it('runs in the AudioWorklet from its own source text', () => {
    const posted: Array<unknown> = [];
    let made:
      | { process: (inputs: Array<Array<Float32Array>>) => boolean }
      | undefined;
    class AudioWorkletProcessor {
      port = { postMessage: (chunk: unknown) => void posted.push(chunk) };
    }
    const registerProcessor = (
      name: string,
      Processor: new () => typeof made,
    ) => {
      expect(name).toBe(PROCESSOR);
      made = new Processor();
    };
    new Function(
      'AudioWorkletProcessor',
      'registerProcessor',
      'sampleRate',
      source,
    )(AudioWorkletProcessor, registerProcessor, 48000);
    expect(made!.process([[block(6144, 0.5)]])).toBe(true);
    expect(posted).toHaveLength(1);
  });
});
