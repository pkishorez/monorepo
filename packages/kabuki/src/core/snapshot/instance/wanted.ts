import type { Data, Tagged, WorkerDefinition } from '../../actor/index.ts';

/*
 * The Workers an Instance's data asks for: each Worker's Condition, read
 * from its Model, State and Props, names the keys it runs for. The Runtime
 * starts and stops Workers by it, and a tool reads it from a Snapshot.
 */

/** Each Worker by name, with the keys its Condition names for this data: `''` for the one Worker of a kind other than `each`. */
export const wanted = (
  workers: Readonly<Record<string, WorkerDefinition>>,
  data: Data<unknown, Tagged, unknown>,
): ReadonlyArray<readonly [name: string, keys: ReadonlyArray<string>]> =>
  Object.entries(workers).map(([name, worker]) => [name, worker.keys(data)]);
