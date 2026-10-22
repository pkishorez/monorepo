import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { keys } from '../../keys.ts';
import type { Place } from '../../places/index.ts';
import * as Picker from '../../ui/picker/index.ts';
import { SessionSwitcherLive, SessionsView } from './actor.ts';

/*
 * The Session Switcher, opened centred by Ctrl+J from anywhere, even while
 * typing; it has no button of its own.
 */

export const SessionSwitcherView = View.make(
  SessionSwitcherLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const { route } = useRouter<Place>();
    const here =
      route._tag === 'Project' ? (route.page?.sessionId ?? null) : null;
    keys.useAction('app.sessions', () =>
      open(() => send({ _tag: 'Open', how: 'keys', open: here })),
    );
    return (
      <Picker.Frame how={model.picking} label="Switch session">
        {children.picker && <SessionsView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
