import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { EllipsisIcon } from '@kestack/web-platform/ui/components/lucide';
import { keys, useBound } from '../../../keys.ts';
import { placeOf, type Route } from '../../places/index.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { ActionsView, SessionActionsLive } from './actor.ts';

/*
 * Session Actions, by the header's button while a session is open, where
 * a click opens them as a popover; `a` opens them centred. A tap opens
 * them in a Drawer.
 */

export const SessionActionsView = View.make(
  SessionActionsLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const bound = useBound('app.actions');
    const route = placeOf(useRouter<Route>().route);
    const at =
      route._tag === 'Project' && route.page !== undefined
        ? { machineId: route.machineId, sessionId: route.page.sessionId }
        : null;
    const actions = () => {
      if (at !== null) open(() => send({ _tag: 'Open', how: 'keys', ...at }));
    };
    keys.useAction('app.actions', actions, { enabled: at !== null });
    keys.useAction('app.actionsAnywhere', actions, { enabled: at !== null });
    if (at === null) return null;
    return (
      <Picker.Frame
        how={model.picking}
        mode="drawer"
        label="Session actions"
        onOpen={() => send({ _tag: 'Open', how: 'pointer', ...at })}
        side="bottom"
        align="end"
        className="w-72"
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Session actions"
            title={
              bound === null ? 'Session actions' : `Session actions (${bound})`
            }
            className="shrink-0 text-muted-foreground"
          >
            <EllipsisIcon aria-hidden />
          </Button>
        }
      >
        {children.picker && <ActionsView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
