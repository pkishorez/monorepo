import { Address, Snapshot } from '../../core/snapshot/index.ts';
import type { Instance } from '../../core/snapshot/index.ts';
import type { AnyActor, Tagged } from '../../core/actor/index.ts';
import type { Drawable, DrawnApp, Handle } from './draw/index.ts';

/*
 * What Views read: what any Instance is drawn from, out of the Snapshot drawn
 * now. It stays the same object while the Instance's Model, State, Props and
 * Children's Addresses stay the same, so a View re-renders only when its own
 * Instance changes.
 * Each new Snapshot drawn is compared with the one before, skipping every
 * part that is the same object in both: only the Views of the Instances that
 * changed, came or went are told, and what is kept for an Instance that went
 * is let go, unless the Snapshot first drawn holds it.
 * A View of the past, of a stopped app, or of an app whose Runtime has not
 * started cannot Send.
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
  const onServer = new Map<string, { instance: Instance; props: Drawable }>();

  /** Who listens at each Address, and the subscribe function they share. */
  const told = new Map<
    string,
    { subscribe: DrawnApp['subscribe']; listeners: Set<() => void> }
  >();
  /** The Addresses listened at whose Instance changed, came or went since they were last told. */
  const changed = new Set<string>();
  const touch = (address: string) => {
    if (told.has(address)) changed.add(address);
  };

  /** Every Instance of the Snapshot last synced, by Address. */
  const index = new Map<string, Instance>();
  let synced: Snapshot | undefined;

  /** The Addresses in the Snapshot first drawn, whose Handles and Sends stay for the Views that hydrate it. */
  let first: { snapshot: Snapshot; addresses: Set<string> } | undefined;
  const isServed = (address: string) => {
    const snapshot = served();
    if (!snapshot) return false;
    if (first?.snapshot !== snapshot)
      first = { snapshot, addresses: addressesIn(snapshot.root, new Set()) };
    return first.addresses.has(address);
  };

  const came = (instance: Instance) => {
    index.set(instance.address, instance);
    touch(instance.address);
    for (const child of childrenOf(instance)) came(child);
  };
  const went = (instance: Instance) => {
    const { address } = instance;
    index.delete(address);
    cache.delete(address);
    if (!isServed(address)) {
      handles.delete(address);
      sends.delete(address);
    }
    touch(address);
    for (const child of childrenOf(instance)) went(child);
  };
  const diff = (was: Instance, is: Instance) => {
    if (was === is) return;
    index.set(is.address, is);
    if (!same(was, is)) touch(is.address);
    for (const slot of new Set([
      ...Object.keys(was.children),
      ...Object.keys(is.children),
    ])) {
      const before = was.children[slot];
      const after = is.children[slot];
      if (before !== after) diffHeld(heldIn(before), heldIn(after));
    }
  };
  const diffHeld = (
    before: ReadonlyArray<Instance>,
    after: ReadonlyArray<Instance>,
  ) => {
    if (
      before.length === after.length &&
      after.every((child, at) => child.address === before[at]!.address)
    ) {
      after.forEach((child, at) => diff(before[at]!, child));
      return;
    }
    const left = new Map(before.map((child) => [child.address, child]));
    for (const child of after) {
      const was = left.get(child.address);
      left.delete(child.address);
      if (was) diff(was, child);
      else came(child);
    }
    for (const child of left.values()) went(child);
  };

  /** Brings the index to the Snapshot drawn now. */
  const sync = () => {
    const now = drawn();
    if (now === synced) return;
    const was = synced?.root;
    const is = now?.root;
    synced = now;
    if (was && is && was.address === is.address) diff(was, is);
    else {
      if (was) went(was);
      if (is) came(is);
    }
  };

  /** Tells, once each, whoever listens at an Address that changed. */
  const notify = () => {
    sync();
    const listeners = new Set<() => void>();
    for (const address of changed)
      for (const listener of told.get(address)?.listeners ?? [])
        listeners.add(listener);
    changed.clear();
    for (const listener of listeners) listener();
  };

  let unfollow = () => {};
  const subscribeAt = (address: Address<any>) => {
    const listen: DrawnApp['subscribe'] = (listener) => {
      sync();
      if (told.size === 0) unfollow = subscribe(notify);
      const here = told.get(address) ?? {
        subscribe: listen,
        listeners: new Set<() => void>(),
      };
      told.set(address, here);
      here.listeners.add(listener);
      return () => {
        here.listeners.delete(listener);
        if (here.listeners.size > 0) return;
        told.delete(address);
        changed.delete(address);
        if (told.size === 0) unfollow();
      };
    };
    return told.get(address)?.subscribe ?? listen;
  };

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

  const propsOf = (
    cache: Map<string, { instance: Instance; props: Drawable }>,
    instance: Instance | undefined,
    address: Address,
  ) => {
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

  const instance = (address: Address) => {
    sync();
    return propsOf(cache, index.get(address), address);
  };

  return {
    subscribe,
    subscribeAt,
    live,
    instance,
    served: (address) => {
      const snapshot = served();
      return snapshot === drawn()
        ? instance(address)
        : propsOf(
            onServer,
            snapshot && Snapshot.at(snapshot, address),
            address,
          );
    },
  };
};

const heldIn = (
  held: Instance | ReadonlyArray<Instance> | undefined,
): ReadonlyArray<Instance> =>
  held === undefined ? [] : Snapshot.isMany(held) ? held : [held];

const childrenOf = (instance: Instance) =>
  Object.values(instance.children).flatMap(heldIn);

const addressesIn = (instance: Instance, addresses: Set<string>) => {
  addresses.add(instance.address);
  for (const child of childrenOf(instance)) addressesIn(child, addresses);
  return addresses;
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
