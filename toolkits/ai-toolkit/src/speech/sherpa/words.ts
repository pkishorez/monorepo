import type { HeardWord } from '../contract/index.js';

/*
 * Parakeet's tokens grouped into Heard Words. A token that starts with a
 * space begins a word, and the tokens after it carry it on. A token of
 * punctuation alone joins the word before it, in its text but not its
 * times: the model gives it where the pause after the word begins.
 */

/** The tokens of a decode, each with when it begins and how long it lasts. */
export interface Tokens {
  readonly tokens: ReadonlyArray<string>;
  readonly timestamps: ReadonlyArray<number>;
  readonly durations: ReadonlyArray<number>;
}

const PUNCTUATION = /^[\p{P}\p{S}]+$/u;

/** Seconds to the millisecond, so a sum of steps reads as it should. */
const seconds = (value: number) => Math.round(value * 1000) / 1000;

export const heardWords = (decoded: Tokens): ReadonlyArray<HeardWord> => {
  const { tokens, timestamps, durations } = decoded;
  if (timestamps.length < tokens.length) return [];
  const words: Array<{ text: string; start: number; end: number }> = [];
  let current: { text: string; start: number; end: number } | undefined;
  let breaks = false;
  tokens.forEach((token, at) => {
    const text = token.trim();
    if (text === '') {
      breaks = true;
      return;
    }
    const spaced = breaks || token !== token.trimStart();
    breaks = false;
    const start = timestamps[at]!;
    const end = start + (durations[at] ?? 0);
    if (PUNCTUATION.test(text) && current !== undefined) {
      current.text += text;
      breaks = spaced;
      return;
    }
    if (current === undefined || spaced) {
      current = { text, start, end };
      words.push(current);
      return;
    }
    current.text += text;
    current.end = Math.max(current.end, end);
  });
  return words.map((word) => ({
    text: word.text,
    start: seconds(word.start),
    end: seconds(word.end),
  }));
};
