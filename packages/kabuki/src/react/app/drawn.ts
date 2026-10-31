import { instanceAt, isMany } from '../../core/snapshot/index.ts';
import type { Instance, Snapshot } from '../../core/snapshot/index.ts';
import type { AnyActor, Tagged } from '../../core/actor/index.ts';
import type { Drawable, DrawnApp, Handle } from '../view/index.ts';

/*
 * What Views read: what any Instance is drawn from, out of the Snapshot drawn
 * now. It stays the same object while the Instance's Model, State, Props and
 * Children's IDs stay the same, so a View re-renders only when its own
 * Instance changes.
 * A View of the past, of a stopped app, or of an app whose Runtime has not
 * started cannot Send. What it keeps for an Instance is let go once the
 * Instance is in neither Snapshot.
 */
export const makeDrawn = (
  drawn: () => Snapshot | undefined,
  served: () => Snapshot | undefined,
  deliver: (id: string, message: Tagged) => void,
  subscribe: DrawnApp['subscribe'],
  live: () => boolean = () => true,
): DrawnApp => {
  const handles = new Map<string, Handle<AnyActor>>();
  const sends = new Map<string, (message: Tagged) => void>();
  const cache = new Map<string, { instance: Instance; props: Drawable }>();

  const handleOf = ({ id, key }: Instance) => {
    let handle = handles.get(id);
    if (!handle)
      handles.set(id, (handle = key === undefined ? { id } : { id, key }));
    return handle;
  };
  const sendTo = (id: string) => {
    let send = sends.get(id);
    if (!send)
      sends.set(
        id,
        (send = (message) => {
          deliver(id, message);
        }),
      );
    return send;
  };

  const propsIn = (
    cache: Map<string, { instance: Instance; props: Drawable }>,
    snapshot: Snapshot | undefined,
    id: string,
  ) => {
    const instance = snapshot && instanceAt(snapshot, id);
    const hit = cache.get(id);
    if (!instance) {
      cache.delete(id);
      return undefined;
    }
    if (hit && (hit.instance === instance || same(hit.instance, instance))) {
      hit.instance = instance;
      return hit.props;
    }
    const next = {
      _tag: instance.state._tag,
      id,
      model: instance.model,
      state: instance.state,
      props: instance.props,
      // The same object while the Children's IDs stay the same, so a memoized
      // component or a `useMemo` given them sees no change.
      children:
        hit && sameIds(hit.instance, instance)
          ? hit.props.children
          : Object.fromEntries(
              Object.entries(instance.children).map(([slot, held]) => [
                slot,
                isMany(held) ? held.map(handleOf) : handleOf(held),
              ]),
            ),
      send: sendTo(id),
    } as Drawable;
    cache.set(id, { instance, props: next });
    return next;
  };

  const onServer = new Map<string, { instance: Instance; props: Drawable }>();

  /** Forget every Instance in neither Snapshot, once per new Snapshot drawn, so keyed Children coming and going leave nothing behind. */
  let pruned: Snapshot | undefined;
  const prune = () => {
    const now = drawn();
    if (now === pruned) return;
    pruned = now;
    const live = new Set<string>();
    idsIn(now, live);
    idsIn(served(), live);
    for (const kept of [handles, sends, cache, onServer])
      for (const id of kept.keys()) if (!live.has(id)) kept.delete(id);
  };

  return {
    subscribe,
    live,
    instance: (id) => {
      prune();
      return propsIn(cache, drawn(), id);
    },
    served: (id) => {
      prune();
      const snapshot = served();
      return snapshot === drawn()
        ? propsIn(cache, snapshot, id)
        : propsIn(onServer, snapshot, id);
    },
  };
};

const idsIn = (instance: Instance | undefined, ids: Set<string>) => {
  if (!instance) return;
  ids.add(instance.id);
  for (const held of Object.values(instance.children))
    for (const child of isMany(held) ? held : [held]) idsIn(child, ids);
};

const same = (a: Instance, b: Instance) =>
  a.model === b.model &&
  a.state === b.state &&
  a.props === b.props &&
  sameIds(a, b);

const sameIds = (a: Instance, b: Instance) => {
  if (a.children === b.children) return true;
  const slots = Object.keys(b.children);
  if (slots.length !== Object.keys(a.children).length) return false;
  return slots.every((slot) => {
    const was = a.children[slot];
    const is = b.children[slot]!;
    if (!was) return false;
    if (!isMany(is) || !isMany(was))
      return !isMany(is) && !isMany(was) && is.id === was.id;
    return (
      is.length === was.length &&
      is.every((kid, index) => kid.id === was[index]!.id)
    );
  });
};
