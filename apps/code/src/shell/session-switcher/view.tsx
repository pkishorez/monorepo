import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { keys } from '../../keys.ts';
import { placeOf, type Route } from '../../places/index.ts';
import * as Picker from '../../ui/picker/index.ts';
import { SessionSwitcherLive, SessionsView } from './actor.ts';

/*
 * The Session Switcher, opened centred by `s` from anywhere; it has no
 * button of its own.
 */

export const SessionSwitcherView = View.make(
  SessionSwitcherLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const route = placeOf(useRouter<Route>().route);
    const here =
      route._tag === 'Project' && route.page !== undefined
        ? { machineId: route.machineId, id: route.page.sessionId }
        : null;
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
