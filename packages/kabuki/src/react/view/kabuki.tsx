import type { ReactNode } from 'react';
import type { AnyActor } from '../../core/actor/index.ts';
import type { Address } from '../../core/data/index.ts';
import type { Runtime, Step } from '../../core/runtime/index.ts';
import { makeDrawn } from './drawn.ts';
import { AppContext } from './draw/index.ts';
import type { DrawnApp, Handle, ViewOf } from './draw/index.ts';

/*
 * Drawing a Runtime or a Step: the root's View, and every View under it,
 * drawn from its Snapshot. A Runtime is drawn at its Head, again after
 * every change, and what a View Sends goes to it while it runs; a Step is
 * one moment, drawn as it is, and what a View Sends from it is dropped.
 */

/** What `<Kabuki>` takes: what to draw, and the View of its root. */
export interface KabukiProps<A> {
  /** A Runtime, drawn at its Head, or a Step, as `runtime.seek` gives one, drawn as it is. */
  readonly of: Runtime<A> | Step<A>;
  /** The View of the root Actor. */
  readonly view: ViewOf<A>;
}

const isRuntime = (of: Runtime<any> | Step<any>): of is Runtime<any> =>
  'send' in of;

// One drawing per Runtime or Step, so drawing one again keeps what its Views read.
const drawings = new WeakMap<object, DrawnApp>();

const drawingOf = (of: Runtime<any> | Step<any>): DrawnApp => {
  let drawn = drawings.get(of);
  if (drawn) return drawn;
  if (isRuntime(of)) {
    // What a server drew and the browser hydrates: the Snapshot it was first drawn at.
    const served = of.snapshot;
    drawn = makeDrawn(
      () => of.snapshot,
      () => served,
      (address, message) => {
        // A stopped Runtime takes no Message: a click then does nothing.
        if (of.running)
          of.send(address, message as never, {
            kind: 'view',
            instance: address,
          });
      },
      of.subscribe,
    );
  } else {
    drawn = makeDrawn(
      () => of.snapshot,
      () => of.snapshot,
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
 * A Runtime or a Step, drawn: `<Kabuki of={runtime} view={AppView} />`.
 * A Runtime is the running app, and a click Sends to it from its View; a
 * Step, `<Kabuki of={runtime.seek(3)} … />`, draws its moment, and a click
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
