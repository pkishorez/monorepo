import { describe, expect, it } from 'vitest';
import { heardWords, type Tokens } from '../words.js';

/*
 * Parakeet's tokens into Heard Words, from what it gave for the start of
 * the model's own `test_wavs/0.wav`.
 */

const decoded = (
  ...steps: ReadonlyArray<readonly [string, number, number]>
): Tokens => ({
  tokens: steps.map(([token]) => token),
  timestamps: steps.map(([, at]) => at),
  durations: steps.map(([, , lasts]) => lasts),
});

describe('heardWords', () => {
  it('begins a word at each token that starts with a space, its end the last token’s', () => {
    expect(
      heardWords(
        decoded(
          [' Well', 0.4, 0.24],
          [',', 0.64, 0.08],
          [' I', 0.72, 0.08],
          [' don', 0.8, 0.16],
          ["'", 0.96, 0.08],
          ['t', 1.04, 0],
          [' w', 1.04, 0.08],
          ['ish', 1.12, 0.16],
        ),
      ),
    ).toEqual([
      { text: 'Well,', start: 0.4, end: 0.64 },
      { text: 'I', start: 0.72, end: 0.8 },
      { text: "don't", start: 0.8, end: 1.04 },
      { text: 'wish', start: 1.04, end: 1.28 },
    ]);
  });

  it('joins punctuation to the word before it, in its text but not its times', () => {
    expect(
      heardWords(
        decoded(
          [' P', 2.64, 0.08],
          ['he', 2.72, 0],
          ['be', 2.88, 0.08],
          [',', 3.12, 0.24],
          [' t', 3.36, 0.08],
          ['ur', 3.44, 0.08],
        ),
      ),
    ).toEqual([
      { text: 'Phebe,', start: 2.64, end: 2.96 },
      { text: 'tur', start: 3.36, end: 3.52 },
    ]);
  });

  it('ends a word at punctuation with a space before it, and at a token of space alone', () => {
    expect(
      heardWords(
        decoded(
          [' wait', 0, 0.16],
          [' -', 0.16, 0.08],
          ['no', 0.24, 0.08],
          [' ', 0.32, 0],
          ['yes', 0.4, 0.08],
        ),
      ),
    ).toEqual([
      { text: 'wait-', start: 0, end: 0.16 },
      { text: 'no', start: 0.24, end: 0.32 },
      { text: 'yes', start: 0.4, end: 0.48 },
    ]);
  });

  it('keeps punctuation that comes first as a word of its own, and reads no duration as none', () => {
    expect(
      heardWords({
        tokens: ['"', 'Hi'],
        timestamps: [0.08, 0.16],
        durations: [],
      }),
    ).toEqual([{ text: '"Hi', start: 0.08, end: 0.16 }]);
  });

  it('hears no words without a time for each token', () => {
    expect(
      heardWords({ tokens: [' a'], timestamps: [], durations: [] }),
    ).toEqual([]);
    expect(heardWords({ tokens: [], timestamps: [], durations: [] })).toEqual(
      [],
    );
  });
});
