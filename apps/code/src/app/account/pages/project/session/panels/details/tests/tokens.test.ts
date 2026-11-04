import { describe, expect, it } from 'vitest';
import { levelOf, tokens } from '../parts/tokens.ts';

describe('tokens', () => {
  it('reads as people say them', () => {
    expect([980, 61_204, 1_228_454, 1_000_000, 272_000].map(tokens)).toEqual([
      '980',
      '61K',
      '1.2M',
      '1M',
      '272K',
    ]);
  });
});

describe('how full', () => {
  it('has room under 80%, fills from 80%, and is full from 95%', () => {
    expect([0.5, 0.8, 0.94, 0.95].map((at) => levelOf(at * 200, 200))).toEqual([
      'fine',
      'filling',
      'filling',
      'full',
    ]);
  });
});
