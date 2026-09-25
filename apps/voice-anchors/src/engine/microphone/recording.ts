/** Grows as blocks arrive and hands back any window of it as one array. */
export class Recording {
  private readonly blocks: Array<Float32Array> = [];
  private length = 0;

  constructor(readonly sampleRate: number) {}

  append(block: Float32Array): void {
    this.blocks.push(block);
    this.length += block.length;
  }

  /** Seconds of audio captured so far. */
  get seconds(): number {
    return this.length / this.sampleRate;
  }

  /** Samples between two audio-clock times, clamped to what exists. */
  window(from: number, to: number): Float32Array<ArrayBuffer> {
    const start = Math.max(0, Math.floor(from * this.sampleRate));
    const end = Math.min(this.length, Math.floor(to * this.sampleRate));
    const out = new Float32Array(Math.max(0, end - start));
    let cursor = 0;
    let written = 0;
    for (const block of this.blocks) {
      const blockStart = cursor;
      const blockEnd = cursor + block.length;
      cursor = blockEnd;
      if (blockEnd <= start) continue;
      if (blockStart >= end) break;
      const sliceStart = Math.max(start, blockStart) - blockStart;
      const sliceEnd = Math.min(end, blockEnd) - blockStart;
      out.set(block.subarray(sliceStart, sliceEnd), written);
      written += sliceEnd - sliceStart;
    }
    return out;
  }
}
