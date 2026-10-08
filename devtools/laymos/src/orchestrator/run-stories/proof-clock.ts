/** Milliseconds since a Proof run began; every Step, phase, and frame is timed on it. */
export interface ProofClock {
  /** Epoch milliseconds when the run began. */
  readonly startedAt: number;
  readonly now: () => number;
}

export function startProofClock(): ProofClock {
  const epoch = () => performance.timeOrigin + performance.now();
  const startedAt = epoch();
  return { startedAt, now: () => epoch() - startedAt };
}
