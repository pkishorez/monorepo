import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { keys } from '../../commands.ts';
import { pageOf, type Route } from '../../../../app.ts';
import * as Picker from '../../../../../ui/controls/picker/index.ts';
import { SessionsLive, ListView } from './actor.ts';

/*
 * The Session Switcher, opened centred by `s` from anywhere; it has no
 * button of its own. On a device with no keyboard it is a Dialog.
 */

export const SessionsView = View.make(
  SessionsLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const page = pageOf(useRouter<Route>().route);
    const here =
      page?._tag === 'Project' && page.page !== undefined
        ? { connectionId: page.connectionId, id: page.page.sessionId }
        : null;
    const switcher = () =>
      open(() => send({ _tag: 'Open', how: 'keys', open: here }));
    keys.useAction('app.sessions', switcher);
    keys.useAction('app.sessionsAnywhere', switcher);
    return (
      <Picker.Frame how={model.picking} mode="sheet" label="Switch session">
        {children.picker && <ListView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
