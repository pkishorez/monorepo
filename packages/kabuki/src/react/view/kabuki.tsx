import type { ReactNode } from 'react';
import type { AnyActor } from '../../core/actor/index.ts';
import type { Address, Snapshot } from '../../core/snapshot/index.ts';
import type { Runtime } from '../../core/runtime/index.ts';
import { makeDrawn } from './drawn.ts';
import { AppContext } from './draw/index.ts';
import type { DrawnApp, Handle, ViewOf } from './draw/index.ts';

/*
 * Drawing a Runtime or a Snapshot: the root's View, and every View under
 * it. A Runtime is drawn at its Snapshot, again after every change, and
 * what a View Sends goes to it while it runs; a Snapshot is the app as
 * data, drawn as it is, and what a View Sends from it is dropped.
 */

/** What `<Kabuki>` takes: what to draw, and the View of its root. */
export interface KabukiProps<A> {
  /** A Runtime, drawn as it is now, or a Snapshot, drawn as it is. */
  readonly of: Runtime<A> | Snapshot<A>;
  /** The View of the root Actor. */
  readonly view: ViewOf<A>;
}

const isRuntime = (of: Runtime<any> | Snapshot<any>): of is Runtime<any> =>
  'follow' in of;

// One drawing per Runtime or Snapshot, so drawing one again keeps what its Views read.
const drawings = new WeakMap<object, DrawnApp>();

const drawingOf = (of: Runtime<any> | Snapshot<any>): DrawnApp => {
  let drawn = drawings.get(of);
  if (drawn) return drawn;
  if (isRuntime(of)) {
    // What a server drew and the browser hydrates: the Snapshot it was first drawn at.
    const served = of.snapshot;
    drawn = makeDrawn(
      () => of.snapshot,
      () => served,
      // A stopped Runtime takes no Message: a click then does nothing.
      (address, message) => {
        of.at(address)?.send(message as never, {
          kind: 'view',
          instance: address,
        });
      },
      (listener) => of.subscribe(listener),
    );
  } else {
    drawn = makeDrawn(
      () => of,
      () => of,
      () => {},
      () => () => {},
      () => false,
    );
  }
  drawings.set(of, drawn);
  return drawn;
};

// The root's Handle, one per Actor: its Address is the root Actor's name.
const roots = new WeakMap<object, Handle<AnyActor>>();

export const rootOf = <A extends AnyActor>(actor: A): Handle<A> => {
  let root = roots.get(actor);
  if (!root) roots.set(actor, (root = { address: actor.name as Address }));
  return root as Handle<A>;
};

/**
 * A Runtime or a Snapshot, drawn: `<Kabuki of={runtime} view={AppView} />`.
 * A Runtime is the running app, and a click Sends to it from its View; a
 * Snapshot, `<Kabuki of={snapshot} … />`, is drawn as it is, and a click
 * does nothing.
 */
export const Kabuki = <A extends AnyActor>({
  of,
  view: RootView,
}: KabukiProps<A>): ReactNode => (
  <AppContext value={drawingOf(of)}>
    <RootView instance={rootOf(RootView.actor)} />
  </AppContext>
);
