import type { BuildId } from '../../domain/build/index.js';
import type { Selection } from '../precache/index.js';

/**
 * What the client environment's build leaves for the later steps: the
 * non-HTML Precache entries and the Build ID computed from them. The server
 * environment reads the Build ID; the worker build reads both.
 */
export interface BuildState {
  assets: Selection | null;
  buildId: BuildId | null;
}

export const makeBuildState = (): BuildState => ({
  assets: null,
  buildId: null,
});
