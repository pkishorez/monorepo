/** Dials for the rolling-window loop. Seconds throughout. */
export interface SessionConfig {
  /** How much recent audio each pass re-transcribes. Keep under 30. */
  readonly windowSeconds: number;
  /** Minimum gap between passes; a pass never starts before the last ends. */
  readonly passEverySeconds: number;
  /** Words this far behind the newest audio are frozen as final. */
  readonly finalizeLagSeconds: number;
  /** Do not bother the model with a window shorter than this. */
  readonly minimumWindowSeconds: number;
  /** Peak amplitude below which a window counts as silence and is skipped. */
  readonly silencePeak: number;
  /** Longest a single word may be; the model's word ends drift past this. */
  readonly maxWordSeconds: number;
}

export const defaultSessionConfig: SessionConfig = {
  windowSeconds: 15,
  passEverySeconds: 1,
  finalizeLagSeconds: 3,
  minimumWindowSeconds: 1,
  silencePeak: 0.01,
  maxWordSeconds: 1,
};
