export type { RunLaymosResult } from '../rpc/index.js';
import type { RunLaymosResult } from '../rpc/index.js';

/**
 * One self-contained DevTools report: a per-tool slice for each supported tool,
 * each a discriminated `{ available }` union so partial packages stay valid.
 */
export interface DevtoolsReport {
  readonly laymos: RunLaymosResult;
}
