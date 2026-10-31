/*
 * `Snapshot`: the whole app as one value, and the only truth about its
 * data; `handle` gives the next one, `instanceAt` and `isMany` read it.
 */

export { handle, instanceAt, isMany } from '../snapshot/index.ts';
export type {
  Snapshot,
  Envelope,
  Handled,
  Instance,
  Source,
} from '../snapshot/index.ts';
