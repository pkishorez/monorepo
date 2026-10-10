import { describe, expect, it } from 'vitest';

import { enterDoes, spaceRuns } from './stories-keys';

describe('spaceRuns', () => {
  it('runs the highlighted card with its own scope', () => {
    expect(spaceRuns({ card: 'top/a', proof: undefined, control: false })).toBe(
      'top/a',
    );
  });

  it('runs a focused Proof row instead of its card', () => {
    expect(
      spaceRuns({ card: 'top/a', proof: 'top/a/proof', control: false }),
    ).toBe('top/a/proof');
  });

  it('runs the card even while a button or link in it has focus', () => {
    expect(spaceRuns({ card: 'top/a', proof: undefined, control: true })).toBe(
      'top/a',
    );
  });
});

describe('enterDoes', () => {
  it('toggles the highlighted card, or opens a focused Proof row', () => {
    expect(
      enterDoes({ card: 'top', proof: undefined, control: false }),
    ).toEqual({ kind: 'toggle', key: 'top' });
    expect(enterDoes({ card: 'top', proof: 'top/p', control: false })).toEqual({
      kind: 'proof',
      key: 'top/p',
    });
  });

  it('leaves Enter to a button or link in the canvas', () => {
    expect(
      enterDoes({ card: 'top', proof: undefined, control: true }),
    ).toBeUndefined();
  });
});
