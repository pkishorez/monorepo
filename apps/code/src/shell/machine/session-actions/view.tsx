import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { EllipsisIcon } from '@kestack/web-platform/components/lucide';
import { keys, useBound } from '../../../keys.ts';
import { placeOf, type Route } from '../../../places/index.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { ActionsView, SessionActionsLive } from './actor.ts';

/*
 * Session Actions, by the header's button while a session is open, where
 * a click opens them as a popover; Ctrl+K opens them centred, even while
 * typing.
 */

export const SessionActionsView = View.make(
  SessionActionsLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const bound = useBound('app.actions');
    const route = placeOf(useRouter<Route>().route);
    const sessionId =
      route._tag === 'Project' ? (route.page?.sessionId ?? null) : null;
    keys.useAction(
      'app.actions',
      () => {
        if (sessionId !== null)
          open(() => send({ _tag: 'Open', how: 'keys', sessionId }));
      },
      { enabled: sessionId !== null },
    );
    if (sessionId === null) return null;
    return (
      <Picker.Frame
        how={model.picking}
        label="Session actions"
        onOpen={() => send({ _tag: 'Open', how: 'pointer', sessionId })}
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
