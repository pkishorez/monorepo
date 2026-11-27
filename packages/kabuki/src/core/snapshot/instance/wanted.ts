import type {
  ActorDefinition,
  Data,
  Tagged,
  WorkerDefinition,
} from '../../actor/index.ts';
import type { Instance } from './instance.ts';

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

/** One Worker the data asks for at an Instance: its name, and the key it runs for if it is one of `each`. */
export interface WantedWorker {
  readonly name: string;
  readonly key?: string;
}

/** The Workers an Instance's data asks for, one per key, as a tool reads them. */
export const workersOf = (
  definition: ActorDefinition,
  { state, model, props }: Instance,
): ReadonlyArray<WantedWorker> =>
  wanted(definition.workers, { state, model, props }).flatMap(([name, keys]) =>
    definition.workers[name]!.kind === 'each'
      ? keys.map((key) => ({ name, key }))
      : keys.map(() => ({ name })),
  );
