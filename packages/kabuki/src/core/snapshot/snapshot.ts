import { handle, instanceAt, isMany } from './engine/index.ts';
import type { Instance } from './engine/index.ts';

/** The whole app as one value, and the only truth about its data. */
export type Snapshot = Instance;

/**
 * Reading and stepping a Snapshot from outside the Runtime, as a devtool or
 * a test does: `handle` gives the next Snapshot from an Envelope, purely;
 * `instanceAt` finds an Instance by its ID; `isMany` tells the list of an
 * `each` Child from one Instance.
 */
export const Snapshot = { handle, instanceAt, isMany };
