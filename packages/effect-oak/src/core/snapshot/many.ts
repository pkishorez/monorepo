import type { Instance } from './snapshot.ts';

/** Tells a keyed Child slot from a fixed one in an Instance's Children. */
export const isMany = (
  held: Instance | ReadonlyArray<Instance>,
): held is ReadonlyArray<Instance> => Array.isArray(held);
