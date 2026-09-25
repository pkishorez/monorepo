/** A context button press: the instant on the audio clock and what it carries. */
export interface Injection<P = unknown> {
  readonly id: string;
  /** Seconds on the audio clock at the moment of the press. */
  readonly at: number;
  /** Press order, so two injections at one boundary keep their sequence. */
  readonly sequence: number;
  readonly payload: P;
}
