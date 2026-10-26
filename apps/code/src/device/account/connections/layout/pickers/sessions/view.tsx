import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { keys } from '../../commands.ts';
import type { Route } from '../../../../../routes/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import { SessionSwitcherLive, SessionsView } from './actor.ts';

/*
 * The Session Switcher, opened centred by `s` from anywhere; it has no
 * button of its own. On a device with no keyboard it is a Dialog.
 */

export const SessionSwitcherView = View.make(
  SessionSwitcherLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const route = useRouter<Route>().route;
    const here =
      route._tag === 'Project' && route.page !== undefined
        ? { connectionId: route.connectionId, id: route.page.sessionId }
        : null;
    const switcher = () =>
      open(() => send({ _tag: 'Open', how: 'keys', open: here }));
    keys.useAction('app.sessions', switcher);
    keys.useAction('app.sessionsAnywhere', switcher);
    return (
      <Picker.Frame how={model.picking} mode="sheet" label="Switch session">
        {children.picker && <SessionsView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
