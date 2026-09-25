import type { Injection } from './injection.ts';
import type { Segment, Transcript } from './segments.ts';
import type { TimedWord } from './words.ts';

/**
 * Boundary `i` sits before word `i`. A press lands after every word that
 * started before it, so a word already under way when the button is pressed
 * stays ahead of the injection. Word ends are ignored: the model stretches a
 * word's end across the silence that follows it.
 */
const boundaryAt = (words: ReadonlyArray<TimedWord>, at: number): number =>
  words.filter((word) => word.start < at).length;

/**
 * Places every injection among the words and folds the result into segments.
 * A word run is one transcription segment; injections at the same boundary
 * keep press order. An injection is final once its time is behind the last
 * final word, or once the transcript is final.
 */
export const place = <P>(
  words: ReadonlyArray<TimedWord>,
  injections: ReadonlyArray<Injection<P>>,
  options: { readonly final: boolean },
): Transcript<P> => {
  const byBoundary = new Map<number, Array<Injection<P>>>();
  for (const injection of [...injections].sort(
    (a, b) => a.sequence - b.sequence,
  )) {
    const boundary = boundaryAt(words, injection.at);
    const list = byBoundary.get(boundary) ?? [];
    list.push(injection);
    byBoundary.set(boundary, list);
  }

  const finalUntil = words.reduce(
    (time, word) => (word.final ? Math.max(time, word.end) : time),
    0,
  );

  const segments: Array<Segment<P>> = [];
  let run: Array<TimedWord> = [];
  const flushRun = () => {
    if (run.length === 0) return;
    segments.push({
      kind: 'transcription',
      words: run,
      text: run.map((word) => word.text).join(' '),
      final: run.every((word) => word.final),
    });
    run = [];
  };
  const flushInjections = (boundary: number) => {
    for (const injection of byBoundary.get(boundary) ?? []) {
      flushRun();
      segments.push({
        kind: 'injected',
        id: injection.id,
        at: injection.at,
        payload: injection.payload,
        final: options.final || injection.at <= finalUntil,
      });
    }
  };

  words.forEach((word, index) => {
    flushInjections(index);
    run.push(word);
  });
  flushInjections(words.length);
  flushRun();

  return { segments, final: options.final };
};
