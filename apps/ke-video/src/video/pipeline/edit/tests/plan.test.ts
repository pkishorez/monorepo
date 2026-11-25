import { describe, expect, it } from 'vitest';
import {
  batches,
  frames,
  plan,
  snap,
  totals,
  type PlanInput,
} from '../plan.ts';
import { sentences, type Word } from '../words.ts';

const word = (text: string, start: number, end = start + 0.4): Word => ({
  text,
  start,
  end,
});

const input = (
  words: ReadonlyArray<Word>,
  rest: Partial<PlanInput> = {},
): PlanInput => ({
  words,
  sentences: sentences(words),
  cuts: [],
  silences: [],
  strength: 'normal',
  duration: 5,
  fps: 10,
  origin: 0,
  ...rest,
});

const ranges = (list: ReadonlyArray<{ start: number; end: number }>) =>
  list.map((r) => [Number(r.start.toFixed(3)), Number(r.end.toFixed(3))]);

describe('plan', () => {
  it('cuts silent pauses over the limit to 0.12 s each side, and keeps shorter ones whole', () => {
    const made = plan(
      input([word('one', 1), word('two', 1.6), word('three.', 3)], {
        silences: [
          { start: 0, end: 1 },
          { start: 1.4, end: 1.6 },
          { start: 2, end: 3 },
          { start: 3.4, end: 5 },
        ],
      }),
    );
    expect(ranges(made.kept)).toEqual([
      [0.9, 2.1],
      [2.9, 3.5],
    ]);
    expect(made.removed.map((r) => r.kind)).toEqual([
      'silence',
      'silence',
      'silence',
    ]);
    expect(made.length).toBeCloseTo(1.8);
    expect(totals(made.removed)).toMatchObject({
      silence: expect.closeTo(3.2),
      fillers: 0,
    });
  });

  it('keeps a silent pause up to the strength limit', () => {
    const words = [word('one', 1), word('two', 2.1, 3)];
    const silences = [{ start: 1.4, end: 2.1 }];
    const light = plan(
      input(words, { strength: 'light', silences, duration: 3 }),
    );
    const heavy = plan(
      input(words, { strength: 'heavy', silences, duration: 3 }),
    );
    expect(ranges(light.kept)).toEqual([[0.9, 3]]);
    expect(ranges(heavy.kept)).toEqual([
      [0.9, 1.5],
      [2, 3],
    ]);
  });

  it('cuts a gap with sound but no words over 0.3 s as fillers', () => {
    const made = plan(
      input([word('one', 0, 1), word('two', 1.6, 2.5)], { duration: 2.5 }),
    );
    expect(ranges(made.kept)).toEqual([
      [0, 1.1],
      [1.5, 2.5],
    ]);
    expect(made.removed).toEqual([
      { start: expect.closeTo(1.1), end: expect.closeTo(1.5), kind: 'fillers' },
    ]);
  });

  it('cuts filler words, keeping their text', () => {
    const made = plan(
      input([word('so', 0, 1), word('um', 1.2, 1.6), word('yes.', 1.8, 3)], {
        duration: 3,
      }),
    );
    expect(made.removed).toEqual([
      {
        start: expect.closeTo(1.1),
        end: expect.closeTo(1.7),
        kind: 'fillers',
        text: 'um',
      },
    ]);
  });

  it("cuts Claude's sentences with their kind and reason", () => {
    const words = [
      word('Hello.', 0, 1),
      word('Buy', 1.2, 1.6),
      word('this.', 1.6, 2),
      word('Bye.', 2.2, 3),
    ];
    const made = plan(
      input(words, {
        duration: 3,
        cuts: [{ from: 2, to: 2, kind: 'ad', reason: 'sponsor read' }],
      }),
    );
    expect(made.removed).toEqual([
      {
        start: expect.closeTo(1.1),
        end: expect.closeTo(2.1),
        kind: 'ad',
        reason: 'sponsor read',
        text: 'Buy this.',
      },
    ]);
    expect(totals(made.removed).ads).toBeCloseTo(1);
  });

  it('lists each Claude cut on its own, even where it touches the next, as in xAt1xcC6qfM', () => {
    // A teaser, music, the host's intro with an "um" and a pause in it, a
    // subscribe ask straight after it, then the talk.
    const words = [
      word('Teaser', 0, 0.4),
      word('one.', 0.5, 1),
      word('Hello', 3, 3.4),
      word('um', 3.4, 3.6),
      word('host.', 4.6, 5),
      word('Subscribe', 5.2, 5.6),
      word('now.', 5.6, 6),
      word('Real', 6.5, 6.9),
      word('talk.', 6.9, 9),
    ];
    const made = plan(
      input(words, {
        duration: 9,
        silences: [
          { start: 3.6, end: 4.6 },
          { start: 6, end: 6.5 },
        ],
        cuts: [
          { from: 1, to: 1, kind: 'filler-talk', reason: 'teaser clips' },
          { from: 2, to: 2, kind: 'filler-talk', reason: 'host intro' },
          { from: 3, to: 3, kind: 'ask', reason: 'subscribe ask' },
        ],
      }),
    );
    // What is cut is the same as it ever was: everything before the talk.
    expect(ranges(made.kept)).toEqual([[6.4, 9]]);
    expect(
      made.removed.map(({ start, end, kind, reason, text }) => [
        Number(start.toFixed(3)),
        Number(end.toFixed(3)),
        kind,
        reason,
        text,
      ]),
    ).toEqual([
      [0, 1, 'filler-talk', 'teaser clips', 'Teaser one.'],
      [1, 3, 'fillers', undefined, undefined],
      [3, 5.1, 'filler-talk', 'host intro', 'Hello um host.'],
      [5.1, 6.4, 'ask', 'subscribe ask', 'Subscribe now.'],
    ]);
    const removed = totals(made.removed);
    expect(removed).toEqual({
      silence: 0,
      fillers: expect.closeTo(2),
      ads: expect.closeTo(1.3),
      fillerTalk: expect.closeTo(3.1),
    });
    expect(
      removed.silence + removed.fillers + removed.ads + removed.fillerTalk,
    ).toBeCloseTo(made.duration - made.length);
  });

  it('lists a long pause next to a Claude cut on its own, and a short one as part of the cut', () => {
    const words = [
      word('Talk.', 0, 1),
      word('Buy', 3, 3.4),
      word('this.', 3.4, 4),
      word('More.', 4.3, 6),
    ];
    const made = plan(
      input(words, {
        duration: 6,
        silences: [
          { start: 1, end: 3 },
          { start: 4, end: 4.3 },
        ],
        cuts: [{ from: 2, to: 2, kind: 'ad', reason: 'sponsor read' }],
      }),
    );
    expect(ranges(made.kept)).toEqual([
      [0, 1.1],
      [4.2, 6],
    ]);
    expect(
      made.removed.map(({ start, end, kind }) => [
        Number(start.toFixed(3)),
        Number(end.toFixed(3)),
        kind,
      ]),
    ).toEqual([
      [1.1, 3, 'silence'],
      [3, 4.2, 'ad'],
    ]);
  });

  it('joins a piece under 0.3 s to its nearer neighbour across a short pause', () => {
    const words = [word('one', 0, 1), word('x', 1.6, 1.62), word('two', 4, 5)];
    const made = plan(
      input(words, {
        silences: [
          { start: 1, end: 1.6 },
          { start: 1.62, end: 4 },
        ],
      }),
    );
    expect(ranges(made.kept)).toEqual([
      [0, 1.7],
      [3.9, 5],
    ]);
  });

  it('drops a piece under 0.3 s between two long silences', () => {
    const words = [word('one', 0, 1), word('x', 3, 3.02), word('two', 6, 7)];
    const made = plan(
      input(words, {
        duration: 7,
        silences: [
          { start: 1, end: 3 },
          { start: 3.02, end: 6 },
        ],
      }),
    );
    expect(ranges(made.kept)).toEqual([
      [0, 1.1],
      [5.9, 7],
    ]);
    expect(made.removed).toHaveLength(1);
  });

  it('puts every boundary on the frame grid', () => {
    const made = plan(
      input([word('one', 0.333, 1.017), word('two', 2.71, 3.33)], {
        fps: 30000 / 1001,
        duration: 4,
      }),
    );
    for (const range of made.kept)
      for (const time of [range.start, range.end]) {
        const frame = (time * 30000) / 1001;
        expect(Math.abs(frame - Math.round(frame))).toBeLessThan(1e-6);
      }
  });
});

describe('snap', () => {
  it('rounds to frames from the origin, merges what touches, and stops at the last frame', () => {
    expect(
      ranges(
        snap(
          [
            { start: 0.04, end: 1.04 },
            { start: 1.03, end: 2 },
            { start: 3.01, end: 9 },
          ],
          10,
          0,
          3.55,
        ),
      ),
    ).toEqual([
      [0, 2],
      [3, 3.5],
    ]);
  });
});

describe('frames and batches', () => {
  it('turns kept ranges into frame indexes, and groups them', () => {
    expect(frames([{ start: 0.5, end: 1 }], 30, 0)).toEqual([[15, 30]]);
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
