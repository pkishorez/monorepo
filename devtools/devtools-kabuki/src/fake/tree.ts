import { Schema } from 'effect';
import { Address, Blueprint, Snapshot } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';
import { controlsOf } from './controls.ts';
import type { Control } from './controls.ts';
import type { Fake } from './fake.ts';

/*
 * A Fake's Instances as the bubble lists them: the root and every Child
 * under it, a keyed one by its key, each with its State's tag, its Model
 * as its Actor's Schema encodes it (plain JSON: Dates are strings), and
 * the Controls its Actor takes. Read from the Snapshot, and from the
 * root's Blueprint for each Instance's Actor.
 */

/** One Instance as the bubble draws it. */
export interface Node {
  readonly address: string;
  readonly actor: string;
  /** Its slot in its parent; none for the root. */
  readonly slot?: string;
  readonly key?: string;
  /** Its State's tag. */
  readonly tag: string;
  /** Its Model, encoded. */
  readonly model: unknown;
  readonly controls: ReadonlyArray<Control>;
  readonly children: ReadonlyArray<Node>;
}

const encoded = (schema: Schema.Top | undefined, value: unknown) => {
  if (!schema) return value;
  try {
    return Schema.encodeUnknownSync(schema as Schema.Codec<unknown, unknown>)(
      value,
    );
  } catch {
    return value;
  }
};

/** Nodes made, by the Instance they are of: a Snapshot shares what did not change. */
const made = new WeakMap<Fake, WeakMap<Instance, Node>>();

/** A Fake's Instances now, from its Snapshot. */
export const treeOf = (fake: Fake, snapshot: Snapshot<any>): Node => {
  let known = made.get(fake);
  if (!known) made.set(fake, (known = new WeakMap()));
  const cache = known;
  const root = fake.actor.blueprint as Blueprint;
  const nodeOf = (instance: Instance, slot?: string): Node => {
    const kept = cache.get(instance);
    if (kept && kept.slot === slot) return kept;
    const print = Blueprint.at(root, Address.place(instance.address));
    const node: Node = {
      address: instance.address,
      actor: instance.actor,
      ...(slot === undefined ? {} : { slot }),
      ...(instance.key === undefined ? {} : { key: instance.key }),
      tag: instance._tag,
      model: encoded(print?.schemas.model, instance.model),
      controls: print ? controlsOf(print, fake.controls) : [],
      children: Object.entries(instance.children).flatMap(([name, held]) =>
        held === undefined
          ? []
          : Snapshot.isMany(held)
            ? held.map((one) => nodeOf(one, name))
            : [nodeOf(held, name)],
      ),
    };
    cache.set(instance, node);
    return node;
  };
  return nodeOf(snapshot.root as Instance);
};
