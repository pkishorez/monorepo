import type { Line, Range } from '../../library/index.ts';

/** A word heard, with its start and end in seconds of the original. */
export interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Words `from` to `to` (inclusive indexes), numbered `n` from 1. */
export interface Sentence {
  readonly n: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

/** A kept sentence: its words that stay, at times of the short video. */
export interface Trimmed extends Line {
  readonly n: number;
  /** Where it starts in the original. */
  readonly original: number;
}

/** A pause between words that ends a sentence, in seconds. */
const SENTENCE_GAP = 1.5;

/** The most words in one sentence. */
const SENTENCE_WORDS = 40;

const FILLERS = new Set(['um', 'uh', 'uhm', 'er', 'erm', 'ah', 'hm', 'm']);

/** Whether a word is a sound that isn't one: um, uh, umm, er, hmm, mm… */
export const isFiller = (text: string): boolean =>
  FILLERS.has(
    text
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/(.)\1+/g, '$1'),
  );

const endsSentence = (text: string) => /[.?!]["'”’)\]]*$/.test(text);

/**
 * Sentences from words in order: each ends at a word ending in . ? or !,
 * before a pause over 1.5 s, or at 40 words.
 */
export const sentences = (words: ReadonlyArray<Word>): Array<Sentence> => {
  const found: Array<Sentence> = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = words[i + 1];
    if (
      next === undefined ||
      endsSentence(word.text) ||
      next.start - word.end > SENTENCE_GAP ||
      i - from + 1 >= SENTENCE_WORDS
    ) {
      found.push({
        n: found.length + 1,
        start: words[from]!.start,
        end: word.end,
        text: words
          .slice(from, i + 1)
          .map((w) => w.text)
          .join(' '),
        from,
        to: i,
      });
      from = i + 1;
    }
  }
  return found;
};

/**
 * Maps a time of the original to the short video made of `kept` (in
 * order): a time inside a cut lands where the cut is.
 */
export const shortTime = (kept: ReadonlyArray<Range>) => {
  const before: Array<number> = [];
  let total = 0;
  for (const range of kept) {
    before.push(total);
    total += range.end - range.start;
  }
  return (time: number): number => {
    let low = 0;
    let high = kept.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (kept[middle]!.start <= time) {
        found = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    if (found === -1) return 0;
    const range = kept[found]!;
    return before[found]! + Math.min(time, range.end) - range.start;
  };
};

const inside = (kept: ReadonlyArray<Range>, time: number) => {
  let low = 0;
  let high = kept.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = kept[middle]!;
    if (time < range.start) high = middle - 1;
    else if (time >= range.end) low = middle + 1;
    else return true;
  }
  return false;
};

/**
 * The sentences as they stay in the short video made of `kept`: only words
 * whose middle is kept, that are not fillers and not in a sentence `cut`
 * names; times mapped to the short video. Numbered again from 1.
 */
export const trimmed = (
  words: ReadonlyArray<Word>,
  all: ReadonlyArray<Sentence>,
  kept: ReadonlyArray<Range>,
  cut: ReadonlySet<number>,
): Array<Trimmed> => {
  const map = shortTime(kept);
  const found: Array<Trimmed> = [];
  for (const sentence of all) {
    if (cut.has(sentence.n)) continue;
    const stay = words
      .slice(sentence.from, sentence.to + 1)
      .filter(
        (word) =>
          !isFiller(word.text) && inside(kept, (word.start + word.end) / 2),
      );
    const first = stay[0];
    const last = stay[stay.length - 1];
    if (first === undefined || last === undefined) continue;
    found.push({
      n: found.length + 1,
      start: map(first.start),
      end: map(last.end),
      text: stay.map((word) => word.text).join(' '),
      original: first.start,
    });
  }
  return found;
};

/** The sentences as lines of the original. */
export const lines = (all: ReadonlyArray<Sentence>): Array<Line> =>
  all.map(({ start, end, text }) => ({ start, end, text }));
