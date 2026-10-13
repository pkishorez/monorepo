import { isMany } from '@kstackz/kabuki';
import type { ActorDefinition, Instance, Snapshot } from '@kstackz/kabuki';
import { measure } from './nodes.ts';
import type { Item, WorkerKey, WorkerRow, WorkerStatus } from './nodes.ts';

/*
 * The Map's tree: its shape from the Actors alone, what runs in it from one
 * Snapshot.
 *
 * One Node per place an Actor can run. Below it: the Children each of its
 * States Invokes, marked with that State, then the Children written at its
 * top. A dim Actor is drawn with everything below it, except an Actor
 * already above it, so a tree of itself ends.
 *
 * Every Node holds every Instance at its place now: one for a fixed Child,
 * any number for a slot of keyed Children. A slot of keyed Children shows
 * one of them, the chosen one: its States count every Instance but mark the
 * chosen one's, its Workers are the chosen one's, and only the chosen one's
 * Children hang below it, so every place below holds at most what one
 * Instance has. Unless another is chosen, it is the one on the way to the
 * Step's Message, or the first.
 *
 * Every Instance and Worker key is found at the Node it is drawn on, and an
 * Instance the Step stopped at its slot's Node, so a Message it Sent still
 * has somewhere to start.
 */

/** What the live app says of an Instance's Workers; nothing away from it. */
export type Statuses = (instance: string) =>
  | ReadonlyArray<{
      readonly name: string;
      readonly key: string;
      readonly status: Exclude<WorkerStatus, 'on'>;
    }>
  | undefined;

const SINGLE = 'Single';

const isStateless = (definition: ActorDefinition) =>
  definition.states.length === 1 && definition.states[0] === SINGLE;

/** An Instance ID without its key and how many times it was Invoked: its parent's ID and its slot. */
const slotOf = (id: string) => id.replace(/(\[[^\]]*\])?#\d+$/, '');

const asList = (
  held: Instance | ReadonlyArray<Instance> | undefined,
): ReadonlyArray<Instance> =>
  held === undefined ? [] : isMany(held) ? held : [held];

export const treeOf = (
  root: ActorDefinition,
  snapshot: Snapshot,
  statuses: Statuses,
  /** The Instance chosen at a place of many, by the place's ID. */
  chosen: ReadonlyMap<string, string> = new Map(),
  /** Instances to choose first, unless one is chosen: the Message's ends. */
  toward: ReadonlyArray<string> = [],
): {
  readonly tree: Item;
  /** The Node an Instance, or one of its Worker keys, is drawn on. */
  readonly find: (id: string) => string | undefined;
} => {
  const drawnAt = new Map<string, string>();

  /** One row per Worker the Actor has, each with the keys its Instances run now. */
  const workers = (
    definition: ActorDefinition,
    instances: ReadonlyArray<Instance>,
    owner: string,
  ): ReadonlyArray<WorkerRow> =>
    Object.entries(definition.workers).map(([name, worker]) => ({
      name,
      ...(worker.state === undefined ? {} : { state: worker.state }),
      keys: instances.flatMap((instance) => {
        if (worker.state !== undefined && worker.state !== instance.state._tag)
          return [];
        const live = statuses(instance.id);
        const data = {
          model: instance.model,
          state: instance.state,
          props: instance.props,
        };
        return worker.keys(data).map((key): WorkerKey => {
          const id = `${instance.id}~${name}#${key}`;
          drawnAt.set(id, owner);
          return {
            id,
            key,
            instance,
            status: live
              ? (live.find((each) => each.name === name && each.key === key)
                  ?.status ?? 'running')
              : 'on',
          };
        });
      }),
    }));

  const actor = (
    definition: ActorDefinition,
    instances: ReadonlyArray<Instance>,
    id: string,
    many: boolean,
    above: ReadonlySet<ActorDefinition>,
  ): Item => {
    for (const instance of instances) drawnAt.set(instance.id, id);
    const stateless = isStateless(definition);
    const pick = many
      ? (instances.find((each) => each.id === chosen.get(id)) ??
        instances.find((each) =>
          toward.some((to) => to === each.id || to.startsWith(`${each.id}/`)),
        ) ??
        instances[0])
      : undefined;
    // What the card shows and what hangs below it: the chosen one's, at a place of many.
    const shown = many ? (pick ? [pick] : []) : instances;
    const size = measure(
      definition.name,
      many,
      stateless ? undefined : definition.states,
      Object.keys(definition.workers),
    );
    const count = (tag: string) =>
      instances.filter((each) => each.state._tag === tag).length;
    const node = {
      id,
      name: definition.name,
      many,
      instances,
      ...(pick ? { chosen: pick } : {}),
      ...(stateless
        ? {}
        : {
            states: size.lines.map((line) =>
              line.map((tag) => ({ tag, count: count(tag) })),
            ),
          }),
      workers: workers(definition, shown, id),
      width: size.width,
      height: size.height,
    };
    // A dim Actor already above it would draw itself forever.
    if (instances.length === 0 && above.has(definition))
      return { node, children: [] };
    const below = new Set(above).add(definition);

    /** The slots written in one State, or at the top, held by `holders`. */
    const slots = (
      state: string,
      lasting: boolean,
      holders: ReadonlyArray<Instance>,
    ) =>
      Object.entries(definition.children[state] ?? {})
        .filter(([name]) => definition.lasting.includes(name) === lasting)
        .map(([name, held]) => {
          const slot = `${id}>${name}`;
          // An Instance this Step stopped is found at its slot.
          for (const holder of instances)
            drawnAt.set(`${holder.id}/${name}`, slot);
          return actor(
            held.definition,
            holders.flatMap((holder) => asList(holder.children[name])),
            slot,
            held.many,
            below,
          );
        });

    const byState = stateless
      ? slots(SINGLE, false, shown).map((item) => ({ item }))
      : definition.states.flatMap((tag) =>
          slots(
            tag,
            false,
            shown.filter((each) => each.state._tag === tag),
          ).map((item) => ({ via: tag, item })),
        );
    const lasting = slots(
      stateless ? SINGLE : definition.states[0]!,
      true,
      shown,
    ).map((item) => ({ item }));
    return { node, children: [...byState, ...lasting] };
  };

  const tree = actor(root, [snapshot], root.name, false, new Set());
  return {
    tree,
    find: (id) => drawnAt.get(id) ?? drawnAt.get(slotOf(id)),
  };
};
