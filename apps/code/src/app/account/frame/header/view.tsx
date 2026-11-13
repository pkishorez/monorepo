import { View, useChild } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { useEffect } from 'react';
import type { Route } from '../../../app.ts';
import { Voice } from './voice/index.ts';
import { HeaderLive, rowRead } from './actor.ts';
import { HeaderTitle } from './header.tsx';

/*
 * The header's Views, each drawn where the frame places it: its title, in
 * the App Shell's header; Voice, around the whole screen, so every field
 * that dictates and the keys reach it; and, until the frame is first
 * shown, nothing, saying which of its rows are read.
 */

/** Where you are, from the rows of the project and session the URL names. */
export const HeaderTitleView = View.make(HeaderLive, ({ children }) => {
  const { route } = useRouter<Route>();
  return (
    <HeaderTitle
      route={route}
      project={children.project}
      session={children.session}
    />
  );
});

/** Voice, drawn around what `Voice.Around` hands it. */
export const HeaderVoice = View.make(HeaderLive, ({ children }) => (
  <Voice.view instance={children.voice} />
));

/** No Instance: what a Hook reads while a Child is absent. */
const NONE = { address: '' };

type Children = ViewProps<typeof HeaderLive>['children'];

/**
 * Draws nothing: says which of its rows are read from this device, the
 * id each asks for once it is (`rowRead`). An absent one is read through
 * no Instance, as the Hook is called either way.
 */
export const HeaderReady = View.make(
  HeaderLive,
  ({ model, children, send }) => {
    const project = useChild(
      children.project ?? (NONE as NonNullable<Children['project']>),
      ({ model, props }) =>
        rowRead(props.projectId, {
          status: model.status,
          asked: props.projectId,
          held: model.rows[0]?.row.id,
        })
          ? props.projectId
          : null,
    );
    const session = useChild(
      children.session ?? (NONE as NonNullable<Children['session']>),
      ({ model, props }) =>
        rowRead(props.sessionId, {
          status: model.status,
          asked: props.sessionId,
          held: model.rows[0]?.row.id,
        })
          ? props.sessionId
          : null,
    );
    const read = {
      project: children.project === undefined ? null : (project ?? null),
      session: children.session === undefined ? null : (session ?? null),
    };
    useEffect(() => {
      if (
        read.project !== model.read.project ||
        read.session !== model.read.session
      )
        send({ _tag: 'RowsRead', ...read });
    }, [read.project, read.session]);
    return null;
  },
);
