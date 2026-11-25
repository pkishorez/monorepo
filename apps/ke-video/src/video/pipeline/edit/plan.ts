import type { CutKind, Range, Removed, Strength } from '../../library/index.ts';
import { isFiller, type Sentence, type Word } from './words.ts';

/** A stretch of sentences Claude cuts, `from` to `to` inclusive, numbered from 1. */
export interface Cut {
  readonly from: number;
  readonly to: number;
  readonly kind: 'ad' | 'ask' | 'filler-talk';
  readonly reason: string;
}

/** A removed stretch of the original, and why. */
export interface Gone {
  readonly start: number;
  readonly end: number;
  readonly kind: CutKind;
  readonly reason?: string;
  readonly text?: string;
}

/** What the short video keeps of the original, snapped to its frames. */
export interface Plan {
  readonly fps: number;
  /** Where the original's first frame is, in seconds. */
  readonly origin: number;
  /** Seconds of the original. */
  readonly duration: number;
  /** Seconds of the short video. */
  readonly length: number;
  readonly kept: ReadonlyArray<Range>;
  readonly removed: ReadonlyArray<Gone>;
  /** The sentence stretches Claude cut. */
  readonly cuts: ReadonlyArray<Cut>;
}

export interface PlanInput {
  readonly words: ReadonlyArray<Word>;
  readonly sentences: ReadonlyArray<Sentence>;
  readonly cuts: ReadonlyArray<Cut>;
  readonly silences: ReadonlyArray<Range>;
  readonly strength: Strength;
  readonly duration: number;
  readonly fps: number;
  readonly origin: number;
}

/** The longest silent pause kept whole, per strength, in seconds. */
export const PAUSE_LIMITS: Record<Strength, number> = {
  light: 0.8,
  normal: 0.5,
  heavy: 0.3,
};

/** The air kept each side of a kept word, in seconds. */
export const PADDING = 0.12;

/** A gap with sound but no words over this is cut, in seconds; a kept piece under it joins a neighbour or goes. */
export const SHORTEST = 0.3;

/** Nothing shorter than this is cut: it would only jolt the picture. */
export const SMALLEST_CUT = 0.1;

/** A short piece joins a neighbour across a pause or filler at most this long. */
const JOIN_ACROSS = 1;

const CLAUDE_KINDS = ['ad', 'ask', 'filler-talk'] as const;

const covered = (
  silences: ReadonlyArray<Range>,
  start: number,
  end: number,
) => {
  let total = 0;
  for (const silence of silences) {
    const overlap = Math.min(end, silence.end) - Math.max(start, silence.start);
    if (overlap > 0) total += overlap;
  }
  return total;
};

interface Mark {
  start: number;
  end: number;
  kind: CutKind;
  reason?: string;
  text?: string;
}

/**
 * Every stretch to remove, in order, before snapping: around words Claude
 * cut or that are fillers, and gaps between kept words that are too long.
 */
const marks = (input: PlanInput): Array<Mark> => {
  const { words, duration } = input;
  const removedBy: Array<Cut | 'filler' | null> = words.map((word) =>
    isFiller(word.text) ? 'filler' : null,
  );
  for (const cut of input.cuts)
    for (let n = cut.from; n <= cut.to; n++) {
      const sentence = input.sentences[n - 1];
      if (sentence === undefined) continue;
      for (let i = sentence.from; i <= sentence.to; i++) removedBy[i] = cut;
    }
  const found: Array<Mark> = [];
  const add = (mark: Mark) => {
    if (mark.end - mark.start >= SMALLEST_CUT) found.push(mark);
  };
  const limit = PAUSE_LIMITS[input.strength];
  let previous: number | null = null;
  for (let i = 0; i <= words.length; i++) {
    if (i < words.length && removedBy[i] !== null) continue;
    const before = previous === null ? null : words[previous]!;
    const after = i < words.length ? words[i]! : null;
    const gapStart = before?.end ?? 0;
    const gapEnd = after?.start ?? duration;
    const start = before === null ? 0 : gapStart + PADDING;
    const end = after === null ? duration : gapEnd - PADDING;
    const between = removedBy.slice((previous ?? -1) + 1, i);
    if (between.length > 0) {
      const claude = new Map<Cut, number>();
      for (const by of between)
        if (by !== null && by !== 'filler')
          claude.set(by, (claude.get(by) ?? 0) + 1);
      const top = [...claude].sort((a, b) => b[1] - a[1])[0]?.[0];
      const text = words
        .slice((previous ?? -1) + 1, i)
        .map((word) => word.text)
        .join(' ');
      add(
        top === undefined
          ? { start, end, kind: 'fillers', text }
          : { start, end, kind: top.kind, reason: top.reason, text },
      );
    } else if (gapEnd > gapStart) {
      const length = gapEnd - gapStart;
      const silent = covered(input.silences, gapStart, gapEnd) >= length / 2;
      if (length > (silent ? limit : SHORTEST))
        add({ start, end, kind: silent ? 'silence' : 'fillers' });
    }
    previous = i;
  }
  return found;
};

const complement = (
  ranges: ReadonlyArray<Range>,
  start: number,
  end: number,
): Array<Range> => {
  const found: Array<Range> = [];
  let at = start;
  for (const range of ranges) {
    if (range.start > at) found.push({ start: at, end: range.start });
    at = Math.max(at, range.end);
  }
  if (end > at) found.push({ start: at, end });
  return found;
};

/** Kept pieces under SHORTEST join the nearer neighbour across a pause or filler, or go. */
const joinShort = (gone: Array<Mark>, duration: number): Array<Mark> => {
  const result = [...gone];
  for (;;) {
    const kept = complement(result, 0, duration);
    const short = kept.findIndex((range) => range.end - range.start < SHORTEST);
    if (short === -1) return result;
    const piece = kept[short]!;
    const left = result.findIndex((mark) => mark.end === piece.start);
    const right = result.findIndex((mark) => mark.start === piece.end);
    const joinable = (index: number) => {
      const mark = result[index];
      return (
        mark !== undefined &&
        (mark.kind === 'silence' || mark.kind === 'fillers') &&
        mark.end - mark.start <= JOIN_ACROSS
      );
    };
    const sizes = [left, right]
      .filter(joinable)
      .sort(
        (a, b) =>
          result[a]!.end -
          result[a]!.start -
          (result[b]!.end - result[b]!.start),
      );
    const across = sizes[0];
    if (across !== undefined) {
      result.splice(across, 1);
      continue;
    }
    if (left !== -1 && right !== -1) {
      const [a, b] = [result[left]!, result[right]!];
      const keep = a.end - a.start >= b.end - b.start ? a : b;
      result.splice(left, 2, { ...keep, start: a.start, end: b.end });
    } else if (left !== -1) result[left] = { ...result[left]!, end: piece.end };
    else if (right !== -1)
      result[right] = { ...result[right]!, start: piece.start };
    else result.push({ start: piece.start, end: piece.end, kind: 'fillers' });
  }
};

/** Kept ranges moved to the nearest frames of the grid at `origin`, every 1/`fps` s. */
export const snap = (
  kept: ReadonlyArray<Range>,
  fps: number,
  origin: number,
  duration: number,
): Array<Range> => {
  const last = Math.floor((duration - origin) * fps + 1e-6);
  const frame = (time: number) =>
    Math.min(last, Math.max(0, Math.round((time - origin) * fps)));
  const found: Array<[number, number]> = [];
  for (const range of kept) {
    const start = frame(range.start);
    const end = frame(range.end);
    if (end <= start) continue;
    const previous = found[found.length - 1];
    if (previous !== undefined && start <= previous[1])
      previous[1] = Math.max(previous[1], end);
    else found.push([start, end]);
  }
  return found.map(([start, end]) => ({
    start: origin + start / fps,
    end: origin + end / fps,
  }));
};

/** Each removed range of the snapped plan, with the kind that removed most of it. */
const label = (
  gaps: ReadonlyArray<Range>,
  gone: ReadonlyArray<Mark>,
): Array<Gone> =>
  gaps.map((gap) => {
    const overlap = new Map<CutKind, { seconds: number; marks: Array<Mark> }>();
    for (const mark of gone) {
      const seconds =
        Math.min(gap.end, mark.end) - Math.max(gap.start, mark.start);
      if (seconds <= 0) continue;
      const entry = overlap.get(mark.kind) ?? { seconds: 0, marks: [] };
      entry.seconds += seconds;
      entry.marks.push(mark);
      overlap.set(mark.kind, entry);
    }
    const ranked = [...overlap].sort((a, b) => b[1].seconds - a[1].seconds);
    const top =
      ranked.find(([kind]) =>
        (CLAUDE_KINDS as ReadonlyArray<string>).includes(kind),
      ) ?? ranked[0];
    if (top === undefined) return { ...gap, kind: 'fillers' };
    const [kind, { marks: by }] = top;
    const reason = by.find((mark) => mark.reason !== undefined)?.reason;
    const text = by
      .map((mark) => mark.text)
      .filter((t) => t !== undefined && t !== '')
      .join(' ');
    return {
      ...gap,
      kind,
      ...(reason === undefined ? {} : { reason }),
      ...(text === '' ? {} : { text }),
    };
  });

/**
 * The plan of a short video: every word not in a cut sentence and not a
 * filler is kept, widened by PADDING. Between two kept words, a silent gap
 * up to the strength's pause limit stays whole; a longer one is cut to
 * PADDING each side (`silence`); a gap with sound but no words over
 * SHORTEST is cut likewise (`fillers`). Pieces under SHORTEST join their
 * neighbour or go; every boundary snaps to the frame grid.
 */
export const plan = (input: PlanInput): Plan => {
  const { duration, fps, origin } = input;
  const gone = joinShort(marks(input), duration);
  const kept = snap(complement(gone, 0, duration), fps, origin, duration);
  const gaps = complement(kept, 0, duration).filter(
    (gap) => gap.end - gap.start >= 0.5 / fps,
  );
  return {
    fps,
    origin,
    duration,
    length: kept.reduce((sum, range) => sum + range.end - range.start, 0),
    kept,
    removed: label(gaps, gone),
    cuts: input.cuts,
  };
};

/** Seconds removed per kind, as a Video's result counts them. */
export const totals = (removed: ReadonlyArray<Gone>): Removed => {
  const sum = { silence: 0, fillers: 0, ads: 0, fillerTalk: 0 };
  for (const gone of removed) {
    const seconds = gone.end - gone.start;
    if (gone.kind === 'silence') sum.silence += seconds;
    else if (gone.kind === 'fillers') sum.fillers += seconds;
    else if (gone.kind === 'filler-talk') sum.fillerTalk += seconds;
    else sum.ads += seconds;
  }
  return sum;
};

/** The kept ranges as frame indexes `[first, end)` of the grid at `origin`. */
export const frames = (
  kept: ReadonlyArray<Range>,
  fps: number,
  origin: number,
): Array<[number, number]> =>
  kept.map((range) => [
    Math.round((range.start - origin) * fps),
    Math.round((range.end - origin) * fps),
  ]);

/** The kept ranges in batches of at most `most`, rendered one batch at a time. */
export const batches = <A>(
  kept: ReadonlyArray<A>,
  most = 80,
): Array<Array<A>> => {
  const found: Array<Array<A>> = [];
  for (let i = 0; i < kept.length; i += most)
    found.push(kept.slice(i, i + most));
  return found;
};
