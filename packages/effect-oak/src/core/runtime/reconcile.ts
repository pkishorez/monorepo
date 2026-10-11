import type { Definition } from '../actor/index.ts';
import { isMany } from '../snapshot/index.ts';
import type { Instance } from '../snapshot/index.ts';
import type { Works } from './work.ts';

/*
 * Reconcile: the same Instance before and after a Message, and the work that
 * must stop and start between them. It starts where the Message landed and
 * walks down only where something changed: an Instance that is the same
 * object is skipped at once.
 *
 * - A Transition leaves the old State (its own Children stop with it), tells
 *   the Instance its new data, and enters the new State. Children written at
 *   the top last through it, and are reconciled like any other.
 * - The same State with new data or new Props tells the Instance, and keyed
 *   Children follow: new ones start, gone ones stop, kept ones are
 *   reconciled.
 */
export const reconcile = (
  works: Works,
  definition: Definition,
  before: Instance,
  after: Instance,
): void => {
  if (before === after) return;
  const transition = before.state._tag !== after.state._tag;
  if (transition) {
    works.leave(before);
    works.change(after);
    works.enter(after);
  } else if (
    before.model !== after.model ||
    before.state !== after.state ||
    before.props !== after.props
  )
    works.change(after);
  if (before.children === after.children) return;

  const slots = definition.children[after.state._tag] ?? {};
  for (const [slot, held] of Object.entries(after.children)) {
    if (transition && !definition.lasting.includes(slot)) continue;
    const was = before.children[slot];
    if (was === held || !was) continue;
    const child = slots[slot]!.definition;
    if (!isMany(held) || !isMany(was)) {
      reconcile(works, child, was as Instance, held as Instance);
      continue;
    }
    const parent = works.parentOf(after, slot);
    const kept = new Map(was.map((kid) => [kid.id, kid]));
    for (const kid of held) {
      const old = kept.get(kid.id);
      if (old) {
        kept.delete(kid.id);
        reconcile(works, child, old, kid);
      } else if (parent) works.start(kid, child, parent);
    }
    for (const gone of kept.values()) works.stop(gone);
  }
};
