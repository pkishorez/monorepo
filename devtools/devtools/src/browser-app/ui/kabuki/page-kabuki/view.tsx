import { View } from '@kestack/kabuki/react';
import { RemoteInspectorView } from './actor-inspector/index.js';
import { KabukiLive } from './actor.js';
import { Away, Connecting, Unpicked, Waiting } from './ui/blank.js';
import { SessionColumn, SessionSelect } from './ui/session-list.js';

/*
 * The page drawn: the live Kabuki Sessions down the left, or in a selector
 * on a narrow screen, and the one picked beside them. With none connected
 * and none picked, the whole page says how to connect one.
 */

export const KabukiView = View.make(
  KabukiLive,
  ({ root, model, state, children, send }) => {
    const { sessions, link } = model;
    const picked = state._tag === 'None' ? null : state.name;
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
        <section
          aria-label="Inspector"
          className="flex min-w-0 flex-1 flex-col"
        >
          <SessionSelect {...listed} />
          {state._tag === 'Open' && 'inspector' in children ? (
            <RemoteInspectorView
              key={state.name}
              instance={children.inspector}
            />
          ) : state._tag === 'Away' ? (
            <Away name={state.name} reconnecting={link !== 'live'} />
          ) : (
            <Unpicked count={sessions.length} />
          )}
        </section>
      </div>
    );
  },
);
