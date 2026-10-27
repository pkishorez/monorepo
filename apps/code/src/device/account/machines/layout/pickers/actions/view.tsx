import { View, type ViewProps } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { EllipsisIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { keys, useBound } from '../../commands.ts';
import type { Route } from '../../../../../routes/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import { ActionsLive, ListView } from './actor.ts';

/*
 * Actions, by the header's button while a session is open, where a click
 * opens them as a popover and a tap in a Drawer; `a` and Ctrl+K open them
 * centred on a session, `?` in Vim Mode and Ctrl+? from anywhere, and the
 * Status Line's help runs Ctrl+?'s Action. On a phone the button is the
 * header's only one, a finger wide. The keyboard's Actions it lists are
 * what worked where it was opened from, as the keyboard said just before
 * the Picker took it, and the one chosen runs after the Picker has
 * closed, back where the user was.
 */

type Self = ViewProps<typeof ActionsLive>;

export const ActionsView = View.make(ActionsLive, (self) => {
  const route = useRouter<Route>().route;
  return (
    <Opened
      {...self}
      at={
        route._tag === 'Project' && route.page !== undefined
          ? { machineId: route.machineId, sessionId: route.page.sessionId }
          : null
      }
    />
  );
});

/** Actions, for the session open, if any. */
export function Opened({
  model,
  children,
  send,
  at,
}: Pick<Self, 'model' | 'children' | 'send'> & {
  readonly at: {
    readonly machineId: string;
    readonly sessionId: string;
  } | null;
}) {
  const open = Picker.useOpen();
  const bound = useBound('app.actions');
  const available = keys.useAvailableActions();
  const latest = useRef(available);
  latest.current = available;
  const { vim } = keys.useKeyboard();
  /** What worked where it is opened, as the keyboard says just before. */
  const working = () =>
    latest.current.filter(({ shadowed }) => !shadowed).map(({ id }) => id);
  const opens = (how: typeof Picker.How.Type) =>
    send({ _tag: 'Open', how, at, available: working(), vim: vim.on });
  const show = () => open(() => opens('keys'));
  keys.useAction('app.actions', show, { enabled: at !== null });
  keys.useAction('app.actionsAnywhere', show, { enabled: at !== null });
  keys.useAction('app.help', show);
  keys.useAction('app.helpAnywhere', show);
  useEffect(() => {
    // Once the Picker is closed, the keyboard back where it was.
    if (model.chosen === null || model.picking !== null) return;
    latest.current.find(({ id }) => id === model.chosen)?.run();
    send({ _tag: 'KeyRan' });
  }, [model.chosen, model.picking, send]);
  return (
    <Picker.Frame
      how={model.picking}
      mode="drawer"
      label="Actions"
      onOpen={opens}
      side="bottom"
      align="end"
      className="w-72"
      {...(at === null
        ? {}
        : {
            trigger: (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Session actions"
                title={
                  bound === null
                    ? 'Session actions'
                    : `Session actions (${bound})`
                }
                className="size-11 shrink-0 text-muted-foreground keyboard:md:size-8 max-md:order-last max-md:rounded-full [&_svg]:size-5 keyboard:md:[&_svg]:size-4"
              >
                <EllipsisIcon aria-hidden />
              </Button>
            ),
          })}
    >
      {children.picker && <ListView instance={children.picker} />}
    </Picker.Frame>
  );
}
