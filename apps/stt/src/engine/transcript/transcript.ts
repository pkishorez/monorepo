/**
 * The words of a session: spoken words on the audio clock, injections pressed
 * during it, and the placement rule that folds both into ordered segments.
 */
import { place as placeInjections } from './placement.ts';
import type { Injection } from './injection.ts';
import type { Transcript } from './segments.ts';
import type { TimedWord } from './words.ts';

export { Word } from './words.ts';
export { emptyTranscript } from './segments.ts';
export type { FinalWord, ProvisionalWord, TimedWord } from './words.ts';
export type { Injection } from './injection.ts';
export type {
  InjectedSegment,
  Segment,
  Transcript,
  TranscriptionSegment,
} from './segments.ts';

/** Folds words and injections into a transcript. Pure. */
export const buildTranscript = <P>(
  words: ReadonlyArray<TimedWord>,
  injections: ReadonlyArray<Injection<P>>,
  options: { readonly final: boolean },
): Transcript<P> => placeInjections(words, injections, options);
