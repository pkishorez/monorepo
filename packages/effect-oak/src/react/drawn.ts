import { instanceAt, isMany } from '../core/index.ts';
import type { AnyActor, Instance, Running, Tagged } from '../core/index.ts';
import type { Drawn, Handle, ViewProps } from './view.tsx';

/*
 * What Views read: the props of any Instance, from the Snapshot drawn now.
 * Props stay the same object while the Instance's Model, State and Children's
 * IDs stay the same, so a View re-renders only when its own Instance changes.
 * A View of the past or of a stopped app cannot Send.
 */
export const makeDrawn = (
  runtime: () => Running<AnyActor> | undefined,
  subscribe: Drawn['subscribe'],
): Drawn => {
  const handles = new Map<string, Handle<AnyActor>>();
  const sends = new Map<string, (message: Tagged) => void>();
  const cache = new Map<
    string,
    { instance: Instance; props: ViewProps<AnyActor> }
  >();

  const handleOf = (id: string) => {
    let handle = handles.get(id);
    if (!handle) handles.set(id, (handle = { id }));
    return handle;
  };
  const sendTo = (id: string) => {
    let send = sends.get(id);
    if (!send)
      sends.set(
        id,
        (send = (message) => {
          const app = runtime();
          if (app && app.state().shown === null) app.send(id, message);
        }),
      );
    return send;
  };

  const props = (id: string) => {
    const app = runtime();
    const instance = app && instanceAt(app.drawn(), id);
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
      id,
      model: instance.model,
      state: instance.state,
      children: Object.fromEntries(
        Object.entries(instance.children).map(([slot, held]) => [
          slot,
          isMany(held)
            ? held.map((kid) => handleOf(kid.id))
            : handleOf(held.id),
        ]),
      ),
      send: sendTo(id),
    } as ViewProps<AnyActor>;
    cache.set(id, { instance, props: next });
    return next;
  };

  return { subscribe, props };
};

const same = (a: Instance, b: Instance) =>
  a.model === b.model && a.state === b.state && sameIds(a, b);

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
