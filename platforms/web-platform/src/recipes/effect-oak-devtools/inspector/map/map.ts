import type { Definition } from 'effect-oak';
import type { Around, Step } from '../../step/index.ts';
import { CIRCLE, layout } from './layout.ts';
import type { Laid } from './layout.ts';
import { unitsOf } from './units.ts';

/*
 * The whole app as a map, laid out top-down, with the Step shown laid over
 * it. Pure.
 *
 * The map comes from the Actors: each Actor leads to every State it can be
 * in, and each State to every Child it Invokes, all the way down. Nothing is
 * running there by default, so it is drawn dim. The Snapshot lights it up:
 * the Instances that exist and the State each is in. The Step marks what it
 * changed: what started or was entered in green, what stopped or was left in
 * red, and an Instance whose data changed. A keyed Child is one node with how
 * many Instances it has, opened on demand to show each.
 *
 * The map holds still from Step to Step: its shape comes from the Actors, not
 * the data. Each parent is centred over its Children, and the root sits at
 * x 0 for good, so only opening a keyed Child moves anything, and never the
 * root. Opened keyed Children keep the old order, a stopped one in place and
 * a new one after its older siblings.
 */

export type { ActorNode, ManyNode, StateNode } from './layout.ts';
export type { Status } from './units.ts';
export { CIRCLE };

export interface AppMap extends Laid {
  /** From the Instance that Sent a Request to the one it went to. */
  readonly request: string | undefined;
}

export const mapOf = (
  definition: Definition,
  around: Around,
  step: Step,
  open: ReadonlySet<string>,
): AppMap => {
  const { centers, ...laid } = layout(unitsOf(definition, around, open));
  const entry = step === 'init' ? undefined : step;
  const centre = (instance: string) => centers.get(laid.at.get(instance) ?? '');
  const from = entry && centre(entry.source.instance);
  const to = entry && centre(entry.instance);
  const bend = from && to && Math.min(from.x, to.x) - 120;
  const request =
    entry && entry.source.instance !== entry.instance && from && to
      ? `M ${from.x - CIRCLE / 2 - 4} ${from.y} C ${bend} ${from.y}, ${bend} ${to.y}, ${to.x - CIRCLE / 2 - 4} ${to.y}`
      : undefined;
  return { ...laid, request };
};
