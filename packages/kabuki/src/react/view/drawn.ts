import { Address, Snapshot } from '../../core/data/index.ts';
import type { Instance } from '../../core/data/index.ts';
import type { AnyActor, Tagged } from '../../core/actor/index.ts';
import type { Drawable, DrawnApp, Handle } from './draw/index.ts';

/*
 * What Views read: what any Instance is drawn from, out of the Snapshot drawn
 * now. It stays the same object while the Instance's Model, State, Props and
 * Children's Addresses stay the same, so a View re-renders only when its own
 * Instance changes.
 * A View of the past, of a stopped app, or of an app whose Runtime has not
 * started cannot Send. What it keeps for an Instance is let go once the
 * Instance is in neither Snapshot.
 */
export const makeDrawn = (
  drawn: () => Snapshot | undefined,
  served: () => Snapshot | undefined,
  deliver: (address: Address, message: Tagged) => void,
  subscribe: DrawnApp['subscribe'],
  live: () => boolean = () => true,
): DrawnApp => {
  const handles = new Map<string, Handle<AnyActor>>();
  const sends = new Map<string, (message: Tagged) => void>();
  const cache = new Map<string, { instance: Instance; props: Drawable }>();

  const handleOf = ({ address }: Instance) => {
    let handle = handles.get(address);
    if (!handle) {
      const key = Address.parse(address).path.at(-1)?.key;
      handles.set(
        address,
        (handle = key === undefined ? { address } : { address, key }),
      );
    }
    return handle;
  };
  const sendTo = (address: Address) => {
    let send = sends.get(address);
    if (!send)
      sends.set(
        address,
        (send = (message) => {
          deliver(address, message);
        }),
      );
    return send;
  };

  const propsIn = (
    cache: Map<string, { instance: Instance; props: Drawable }>,
    snapshot: Snapshot | undefined,
    address: Address,
  ) => {
    const instance = snapshot && Snapshot.at(snapshot, address);
    const hit = cache.get(address);
    if (!instance) {
      cache.delete(address);
      return undefined;
    }
    if (hit && (hit.instance === instance || same(hit.instance, instance))) {
      hit.instance = instance;
      return hit.props;
    }
    const next = {
      _tag: instance.state._tag,
      address,
      model: instance.model,
      state: instance.state,
      props: instance.props,
      // The same object while the Children's Addresses stay the same, so a
      // memoized component or a `useMemo` given them sees no change.
      children:
        hit && sameAddresses(hit.instance, instance)
          ? hit.props.children
          : Object.fromEntries(
              Object.entries(instance.children).map(([slot, held]) => [
                slot,
                Snapshot.isMany(held) ? held.map(handleOf) : handleOf(held),
              ]),
            ),
      send: sendTo(address),
    } as Drawable;
    cache.set(address, { instance, props: next });
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
    addressesIn(now?.root, live);
    addressesIn(served()?.root, live);
    for (const kept of [handles, sends, cache, onServer])
      for (const address of kept.keys())
        if (!live.has(address)) kept.delete(address);
  };

  return {
    subscribe,
    live,
    instance: (address) => {
      prune();
      return propsIn(cache, drawn(), address);
    },
    served: (address) => {
      prune();
      const snapshot = served();
      return snapshot === drawn()
        ? propsIn(cache, snapshot, address)
        : propsIn(onServer, snapshot, address);
    },
  };
};

const addressesIn = (
  instance: Instance | undefined,
  addresses: Set<string>,
) => {
  if (!instance) return;
  addresses.add(instance.address);
  for (const held of Object.values(instance.children))
    for (const child of Snapshot.isMany(held) ? held : [held])
      addressesIn(child, addresses);
};

const same = (a: Instance, b: Instance) =>
  a.model === b.model &&
  a.state === b.state &&
  a.props === b.props &&
  sameAddresses(a, b);

const sameAddresses = (a: Instance, b: Instance) => {
  if (a.children === b.children) return true;
  const slots = Object.keys(b.children);
  if (slots.length !== Object.keys(a.children).length) return false;
  return slots.every((slot) => {
    const was = a.children[slot];
    const is = b.children[slot]!;
    if (!was) return false;
    if (!Snapshot.isMany(is) || !Snapshot.isMany(was))
      return (
        !Snapshot.isMany(is) &&
        !Snapshot.isMany(was) &&
        is.address === was.address
      );
    return (
      is.length === was.length &&
      is.every((kid, index) => kid.address === was[index]!.address)
    );
  });
};
