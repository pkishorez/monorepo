import { describe, expect, it } from 'vitest';
import { pieces, quietest, sampleCutter, toFloat } from '../audio.ts';

describe('pieces', () => {
  const never = () => {
    throw new Error('no quiet search expected');
  };

  it('keeps audio of 20 s or less whole', () => {
    expect(pieces(20, [], never)).toEqual([{ start: 0, end: 20 }]);
    expect(pieces(0, [], never)).toEqual([]);
  });

  it('cuts in the middle of the silence nearest the 20 s limit', () => {
    const silences = [
      { start: 12, end: 13 },
      { start: 17, end: 18 },
      { start: 31, end: 33 },
    ];
    expect(pieces(45, silences, never)).toEqual([
      { start: 0, end: 17.5 },
      { start: 17.5, end: 32 },
      { start: 32, end: 45 },
    ]);
  });

  it('cuts a silence running past the limit at the limit', () => {
    expect(pieces(30, [{ start: 19, end: 25 }], never)).toEqual([
      { start: 0, end: 20 },
      { start: 20, end: 30 },
    ]);
  });

  it('ignores silences too early in the piece, and falls back to the quietest stretch', () => {
    const asked: Array<[number, number]> = [];
    const found = pieces(30, [{ start: 2, end: 3 }], (from, to) => {
      asked.push([from, to]);
      return 14;
    });
    expect(asked).toEqual([[10, 20]]);
    expect(found).toEqual([
      { start: 0, end: 14 },
      { start: 14, end: 30 },
    ]);
  });

  it('never makes a piece over the limit', () => {
    const found = pieces(3600, [], (from, to) => (from + to) / 2);
    expect(found.every((p) => p.end - p.start <= 20)).toBe(true);
    expect(found[0]!.start).toBe(0);
    expect(found[found.length - 1]!.end).toBe(3600);
  });
});

describe('quietest', () => {
  it('finds the middle of the quiet stretch in loud audio', () => {
    const rate = 1000;
    const pcm = new Int16Array(10 * rate).fill(8000);
    for (let i = 6000; i < 6200; i++) pcm[i] = 0;
    expect(quietest(pcm, rate, 2, 9)).toBeCloseTo(6.1, 1);
  });
});

describe('toFloat', () => {
  it('maps 16-bit samples into [-1, 1]', () => {
    expect([...toFloat(new Int16Array([0, 16384, -32768]))]).toEqual([
      0, 0.5, -1,
    ]);
  });
});

describe('sampleCutter', () => {
  it('keeps only the kept frames, exact in length, across chunks', () => {
    const cut = sampleCutter(
      [
        [2, 5],
        [8, 10],
      ],
      2,
      1,
    );
    const frames = Array.from({ length: 12 }, (_, i) => [i, -i]).flat();
    const out = [
      ...cut(new Float32Array(frames.slice(0, 8))),
      ...cut(new Float32Array(frames.slice(8))),
    ];
    expect(out.length).toBe((3 + 2) * 2);
  });

  it('fades in and out at each cut so the sound never jumps', () => {
    const cut = sampleCutter([[0, 100]], 1, 10);
    const out = cut(new Float32Array(100).fill(1));
    expect(out[0]).toBeLessThan(0.1);
    expect(out[50]).toBe(1);
    expect(out[99]).toBeLessThan(0.1);
    for (let i = 1; i < 10; i++) expect(out[i]!).toBeGreaterThan(out[i - 1]!);
  });
});
