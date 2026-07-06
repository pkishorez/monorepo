export type { RunDepcruiseResult } from '../rpc/index.js';
import type { RunDepcruiseResult } from '../rpc/index.js';

/**
 * One self-contained DevTools report: a per-tool slice for each supported tool,
 * each a discriminated `{ available }` union so partial packages stay valid.
 */
export interface DevtoolsReport {
  readonly depcruise: RunDepcruiseResult;
}
