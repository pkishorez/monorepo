import { describe, expect, it } from 'vitest';
import { spendsOf, type Turn } from './turns.ts';

const turn = (id: string, costUsd?: number): Turn => ({
  id,
  asks: [],
  rows: [],
  ended: {
    kind: 'ended',
    id: `${id}:end`,
    turnId: id,
    status: 'done',
    duration: 1000,
    error: null,
    usage:
      costUsd === undefined
        ? null
        : { inputTokens: 1, outputTokens: 1, costUsd },
  },
});

const at = (spends: ReturnType<typeof spendsOf>) =>
  Object.fromEntries(
    [...spends].map(([id, { turn, total }]) => [
      id,
      [turn === null ? null : Number(turn.toFixed(2)), total],
    ]),
  );

describe("a turn's cost", () => {
  it("is its running total less the last one's, the first all its own", () => {
    expect(
      at(spendsOf([turn('a', 0.1), turn('b', 0.25), turn('c', 0.4)], false)),
    ).toEqual({ a: [0.1, 0.1], b: [0.15, 0.25], c: [0.15, 0.4] });
  });

  it('is the whole total when the total started over', () => {
    expect(at(spendsOf([turn('a', 0.5), turn('b', 0.2)], false))).toEqual({
      a: [0.5, 0.5],
      b: [0.2, 0.2],
    });
  });

  it("is not told for a fork's first turn, whose total holds what it came from", () => {
    expect(at(spendsOf([turn('a', 1.2), turn('b', 1.5)], true))).toEqual({
      a: [null, 1.2],
      b: [0.3, 1.5],
    });
  });

  it('skips turns that told no cost, as Codex', () => {
    expect(
      at(spendsOf([turn('a', 0.1), turn('b'), turn('c', 0.3)], false)),
    ).toEqual({ a: [0.1, 0.1], c: [0.2, 0.3] });
  });
});
