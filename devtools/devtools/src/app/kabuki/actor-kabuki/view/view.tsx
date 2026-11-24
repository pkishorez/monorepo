import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { nameOf } from '../logic/shared/index.js';
import type { KabukiShape } from '../logic/shared/index.js';
import { Away, Connecting, Unpicked, Waiting } from './blank.js';
import { SessionColumn, SessionPath, SessionSelect } from './session-list.js';

/*
 * The Kabuki Tool drawn: the live Kabuki Sessions down the left, by app
 * and Environment, or in a selector on a narrow screen, and the one picked
 * beside them under where it runs. With none connected and none picked,
 * the whole Tool says how to connect one.
 */

type BodyProps = ViewPropsOf<typeof KabukiShape> & {
  /** The Inspector on the Kabuki Session picked, while it is open. */
  readonly inspector: ReactNode;
};

export function Body({ root, model, state, send, inspector }: BodyProps) {
  const { sessions, link } = model;
  const picked = nameOf(state);
  const pick = (name: string) => send({ _tag: 'Chosen', name });

  if (sessions === null)
    return (
      <div {...root} className="flex h-full min-h-0">
        <Connecting />
      </div>
    );
  if (sessions.length === 0 && picked === null)
    return (
      <div {...root} className="flex h-full min-h-0">
        <Waiting link={link} />
      </div>
    );

  const listed = { sessions, picked, link, onPick: pick };
  return (
    <div {...root} className="flex h-full min-h-0">
      <SessionColumn {...listed} />
      <section aria-label="Inspector" className="flex min-w-0 flex-1 flex-col">
        <SessionSelect {...listed} />
        {picked !== null && <SessionPath sessions={sessions} picked={picked} />}
        {state._tag === 'Inspection' && inspector !== null ? (
          inspector
        ) : state._tag === 'Absence' ? (
          <Away name={state.name} reconnecting={link !== 'live'} />
        ) : (
          <Unpicked count={sessions.length} />
        )}
      </section>
    </div>
  );
}
