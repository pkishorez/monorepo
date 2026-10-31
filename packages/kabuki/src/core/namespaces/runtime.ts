import { Runtime as Runtimes } from '../runtime/index.ts';

/*
 * `Runtime`: an Actor's History run live in Effect, with Workers, Commands
 * and Queries, and reached from outside the tree.
 */

/** Runs an Actor, or a History of one, in a Scope: its Layer gives what the tree Requires. */
export const start = Runtimes.start;
/** What a Query asked from outside fails with once its Instance, or the Runtime, has stopped. */
export { Stopped } from '../runtime/index.ts';

export type {
  Running,
  /** A live Instance, reached from outside the tree. */
  LiveInstance as Instance,
  Needs,
  Provided,
  WorkerStatus,
} from '../runtime/index.ts';
