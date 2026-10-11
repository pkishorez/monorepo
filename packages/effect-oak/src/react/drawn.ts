import { instanceAt, isMany } from '../core/index.ts';
import type { AnyActor, Instance, Snapshot, Tagged } from '../core/index.ts';
import type { Drawable, Drawn, Handle } from './view.tsx';

/*
 * What Views read: what any Instance is drawn from, out of the Snapshot drawn
 * now. It stays the same object while the Instance's Model, State, Props and
 * Children's IDs stay the same, so a View re-renders only when its own
 * Instance changes.
 * A View of the past, of a stopped app, or of an app whose Runtime has not
 * started cannot Send.
 */
export const makeDrawn = (
  drawn: () => Snapshot | undefined,
  served: () => Snapshot | undefined,
  deliver: (id: string, message: Tagged) => void,
  subscribe: Drawn['subscribe'],
): Drawn => {
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
  return {
    subscribe,
    props: (id) => propsIn(cache, drawn(), id),
    served: (id) => {
      const snapshot = served();
      return snapshot === drawn()
        ? propsIn(cache, snapshot, id)
        : propsIn(onServer, snapshot, id);
    },
  };
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
