import type { TimedWord } from './words.ts';

/** A run of spoken words. Final once every word in it is final. */
export interface TranscriptionSegment {
  readonly kind: 'transcription';
  readonly words: ReadonlyArray<TimedWord>;
  readonly text: string;
  readonly final: boolean;
}

/** An injection placed among the words. Settled once its neighbours are final. */
export interface InjectedSegment<P = unknown> {
  readonly kind: 'injected';
  readonly id: string;
  readonly at: number;
  readonly payload: P;
  readonly final: boolean;
}

export type Segment<P = unknown> = TranscriptionSegment | InjectedSegment<P>;

export interface Transcript<P = unknown> {
  readonly segments: ReadonlyArray<Segment<P>>;
  /** True once the session has stopped and nothing can change. */
  readonly final: boolean;
}

export const emptyTranscript: Transcript<never> = {
  segments: [],
  final: false,
};
