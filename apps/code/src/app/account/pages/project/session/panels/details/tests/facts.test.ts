import { describe, expect, it } from 'vitest';
import { factsOf, inputOf, mostOf, totalOf, type Told } from '../facts.ts';

const turn = (id: string, over: Partial<Told> = {}): Told => ({
  id,
  prompt: `Ask ${id}`,
  status: 'done',
  duration: 1_000,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 80,
    cacheWriteTokens: 5,
  },
  spend: null,
  ...over,
});

describe('factsOf', () => {
  it("sums each turn's time and tokens, numbering the turns from 1", () => {
    const facts = factsOf([turn('a'), turn('b', { duration: 2_500 })]);
    expect(facts.turns.map(({ n }) => n)).toEqual([1, 2]);
    expect(facts.duration).toBe(3_500);
    expect(facts.tokens).toEqual({
      read: 160,
      written: 10,
      fresh: 20,
      output: 10,
    });
    expect(totalOf(facts.tokens)).toBe(200);
    expect(inputOf(facts.tokens)).toBe(190);
  });

  it('has no cost where the agent tells none, as Codex', () => {
    const facts = factsOf([turn('a'), turn('b')]);
    expect(facts.cost).toBeNull();
    expect(facts.turns.every(({ cost }) => cost === null)).toBe(true);
  });

  it("keeps the session's cost as last told, and each turn's own", () => {
    const facts = factsOf([
      turn('a', { spend: { turn: 0.4, total: 0.4 } }),
      turn('b', { spend: { turn: 0.6, total: 1 } }),
      turn('c', { status: null, duration: null, usage: null, spend: null }),
    ]);
    expect(facts.cost).toBe(1);
    expect(facts.turns.map(({ cost }) => cost)).toEqual([0.4, 0.6, null]);
    expect(facts.turns[2]?.tokens).toBeNull();
  });

  it("leaves a fork's first turn without a cost of its own", () => {
    const facts = factsOf([turn('a', { spend: { turn: null, total: 3 } })]);
    expect(facts.cost).toBe(3);
    expect(facts.turns[0]?.cost).toBeNull();
  });
});

describe('mostOf', () => {
  it('finds the turn that stands out', () => {
    const facts = factsOf([
      turn('a', { duration: 1_000 }),
      turn('b', { duration: 9_000 }),
      turn('c', { duration: 2_000 }),
    ]);
    expect(mostOf(facts, ({ duration }) => duration)?.id).toBe('b');
  });

  it('finds none among fewer than two turns that say', () => {
    const facts = factsOf([turn('a'), turn('b', { duration: null })]);
    expect(mostOf(facts, ({ duration }) => duration)).toBeNull();
  });
});
