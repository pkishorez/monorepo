import type { ActorDefinition } from '../../actor/index.ts';
import type { Address } from '../address/index.ts';
import type { Snapshot } from '../instance/index.ts';
import { create } from './invoke.ts';

/*
 * Init: the first Snapshot. The root runs init from its Input and Invokes
 * its Children, all the way down, at Time 0. Pure; Effects never run.
 */

/** The app right after init: the root, at its Actor's name, and every Child its State Invokes. */
export const init = (root: ActorDefinition, input?: unknown): Snapshot => ({
  root: create(root, root.name as Address, { input }),
  at: 0,
});

const inits = new WeakMap<
  ActorDefinition,
  { readonly input: unknown; readonly snapshot: Snapshot }
>();

/** The app right after init with this Input: the same value each time it is asked again. */
export const initial = (root: ActorDefinition, input: unknown): Snapshot => {
  const found = inits.get(root);
  if (found && Object.is(found.input, input)) return found.snapshot;
  const snapshot = init(root, input);
  inits.set(root, { input, snapshot });
  return snapshot;
};
