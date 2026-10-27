import { describe, expect, it } from 'vitest';
import type { Part } from '@kestack/connect/code';
import type { Row } from '../rows/index.ts';
import { isSaid } from '../answer/said.tsx';
import { piecesOf, spendsOf, type Turn } from '../turns.ts';

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

describe('a question the agent asked', () => {
  type Call = Extract<Part, { readonly type: 'toolCall' }>;
  const tool = (id: string, tool: Call['tool'], input: Call['input']): Row => ({
    kind: 'tool',
    id,
    call: { type: 'toolCall', id, tool, name: id, title: '', input },
    result: null,
    state: 'done',
  });
  const read = tool('r', 'read', { file_path: 'a.ts' });
  const asked = tool('q', 'question', {
    questions: [{ header: 'Colour', question: 'Which colour?', options: [] }],
  });

  it('is said, between the runs of work around it', () => {
    expect(isSaid(asked)).toBe(true);
    expect(piecesOf([read, asked, read]).map(({ kind }) => kind)).toEqual([
      'work',
      'said',
      'work',
    ]);
  });

  it('is work as any call when it holds no question', () => {
    expect(isSaid(tool('x', 'question', { nothing: true }))).toBe(false);
  });
});
