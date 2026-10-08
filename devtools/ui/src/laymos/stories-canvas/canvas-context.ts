import { createContext, useContext } from 'react';

import type { Run } from './run-progress';
import type { ProofReports, TreeIndex } from './story-scope';

export interface CanvasState {
  /** The reports to show: none for a Proof of the run under way not yet finished. */
  readonly reports: ProofReports;
  readonly running: ReadonlySet<string>;
  /** Proofs of the run under way waiting their turn. */
  readonly pending: ReadonlySet<string>;
  /** The run under way, or the last one. */
  readonly run: Run | undefined;
  /** The Proofs of `run` that have finished. */
  readonly finished: ReadonlySet<string>;
  readonly index: TreeIndex;
  readonly criticalOnly: boolean;
  readonly reducedMotion: boolean;
  /** The Proof whose panel is open. */
  readonly shownProof: string | undefined;
  readonly onRun: (scope: string) => void;
  /** Opens every Story down to `id` and brings it into view. */
  readonly onStoryLink: (id: string) => void;
  /** Opens every Story down to the Proof, unfolds its list and opens its panel. */
  readonly onProofLink: (id: string) => void;
  /** Opens a Proof panel. */
  readonly onShowProof: (id: string) => void;
}

export const CanvasContext = createContext<CanvasState | null>(null);

export function useCanvasState(): CanvasState {
  const state = useContext(CanvasContext);
  if (state === null) throw new Error('CanvasContext is missing.');
  return state;
}
