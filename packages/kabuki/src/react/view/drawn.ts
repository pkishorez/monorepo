import { Snapshot } from '../../core/snapshot/index.ts';
import type { Instance } from '../../core/snapshot/index.ts';
import type { AnyActor, Tagged } from '../../core/actor/index.ts';
import type { Drawable, DrawnApp, Handle } from './draw/index.ts';

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
    const instance = snapshot && indexOf(snapshot).get(id);
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
                Snapshot.isMany(held) ? held.map(handleOf) : handleOf(held),
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
    const was = served();
    const live = indexOf(now);
    const first = was === undefined ? undefined : indexOf(was);
    for (const kept of [handles, sends, cache, onServer])
      for (const id of kept.keys())
        if (!live.has(id) && !first?.has(id)) kept.delete(id);
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

/**
 * Every Instance of a Snapshot by its ID, made once per Snapshot: each View
 * reads its own Instance after every Message, and finding each by walking
 * down from the root would cost every View the walk.
 */
const indexes = new WeakMap<Snapshot, ReadonlyMap<string, Instance>>();
const EMPTY: ReadonlyMap<string, Instance> = new Map();

const indexOf = (snapshot: Snapshot | undefined) => {
  if (!snapshot) return EMPTY;
  let index = indexes.get(snapshot);
  if (!index) {
    const all = new Map<string, Instance>();
    indexIn(snapshot, all);
    indexes.set(snapshot, (index = all));
  }
  return index;
};

const indexIn = (instance: Instance, all: Map<string, Instance>) => {
  all.set(instance.id, instance);
  for (const held of Object.values(instance.children))
    for (const child of Snapshot.isMany(held) ? held : [held])
      indexIn(child, all);
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
    if (!Snapshot.isMany(is) || !Snapshot.isMany(was))
      return !Snapshot.isMany(is) && !Snapshot.isMany(was) && is.id === was.id;
    return (
      is.length === was.length &&
      is.every((kid, index) => kid.id === was[index]!.id)
    );
  });
};
