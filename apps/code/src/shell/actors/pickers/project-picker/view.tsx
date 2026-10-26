import { View, type ViewProps } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  PlusIcon,
  TriangleAlertIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { keys, useBound } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { Starter } from '../../../pages/project/index.ts';
import type { Route } from '../../../routes/index.ts';
import { useEffect, useRef } from 'react';
import { ProjectPickerLive, ProjectsView } from './actor.ts';

/*
 * The Project Picker: `o` opens it centred from anywhere, drawn by the
 * View the shell keeps whatever the sidebar shows, as does a button that
 * runs its keys, such as home's "Open a folder", in a Drawer when tapped;
 * the Button, the round plus at the right of the sidebar's foot, opens it
 * by pointer as a popover above it, and by a tap in a tall Drawer, its
 * folders too, each tapped into. Picked there, a Project's new session
 * opens in a Drawer over it (`Start`); closing that goes back to choosing,
 * and starting it closes both on the Session's page, the keys there.
 * A folder made without its git repository says so over the page until
 * dismissed.
 */

export const ProjectPickerView = View.make(
  ProjectPickerLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    // By its keys, or by a button elsewhere that runs them, such as home's
    // "Open a folder": a tap there draws it for a finger.
    const picker = () =>
      open(() => send({ _tag: 'Open', how: Picker.howTyped() }));
    keys.useAction('app.projects', picker);
    keys.useAction('app.projectsAnywhere', picker);
    return (
      <Picker.Frame
        how={model.byButton ? null : model.picking}
        mode="drawer"
        tall
        held={model.starting !== null}
        label="Open a project"
      >
        {children.picker && <ProjectsView instance={children.picker} />}
        <Start model={model} starter={children.starter} send={send} />
      </Picker.Frame>
    );
  },
);

export const ProjectPickerButton = View.make(
  ProjectPickerLive,
  ({ model, children, send }) => {
    const bound = useBound('app.projects');
    return (
      <Picker.Frame
        how={model.byButton ? model.picking : null}
        mode="drawer"
        tall
        held={model.starting !== null}
        label="Open a project"
        onOpen={(how) => send({ _tag: 'Open', how, byButton: true })}
        side="top"
        className="w-96"
        // Round, 56px and raised on a phone, 44px and barely raised wider, sinking as it is pressed.
        trigger={
          <Button
            aria-label="Open a project"
            title={
              bound === null ? 'Open a project' : `Open a project (${bound})`
            }
            className="size-14 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.16),0_6px_20px_rgb(0_0_0/0.22)] transition-[transform,box-shadow,background-color] duration-150 ease-out active:scale-90 active:shadow-[0_1px_2px_rgb(0_0_0/0.16)] motion-reduce:transition-none md:size-11 md:shadow-[0_1px_2px_rgb(0_0_0/0.12),0_2px_8px_rgb(0_0_0/0.08)] [&_svg]:size-6! md:[&_svg]:size-5!"
          >
            <PlusIcon aria-hidden />
          </Button>
        }
      >
        {children.picker && <ProjectsView instance={children.picker} />}
        <Start model={model} starter={children.starter} send={send} />
      </Picker.Frame>
    );
  },
);

/** Why the folder just made has no git repository, until dismissed. */
export const ProjectPickerNotice = View.make(
  ProjectPickerLive,
  ({ model, send }) =>
    model.warning && (
      <p
        role="status"
        className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-3xl items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
      >
        <TriangleAlertIcon
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-warning"
        />
        <span className="min-w-0 flex-1">
          Made <span className="font-mono text-xs">{model.warning.path}</span>,
          but <span className="font-mono text-xs">git init</span> failed:{' '}
          {model.warning.reason}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          className="text-muted-foreground"
          onClick={() => send({ _tag: 'Dismiss' })}
        >
          <XIcon aria-hidden />
        </Button>
      </p>
    ),
);

type Self = ViewProps<typeof ProjectPickerLive>;

/**
 * A Project picked on touch: its new session in a Drawer over the Picker.
 * Closed, the Picker is where it was; the session started, its page open,
 * the Picker closes with it.
 */
function Start({
  model,
  starter,
  send,
}: {
  readonly model: Self['model'];
  readonly starter: Self['children']['starter'];
  readonly send: Self['send'];
}) {
  const { starting } = model;
  return (
    <Drawer
      open={starting !== null}
      onOpenChange={(open) => {
        if (!open) send({ _tag: 'StartClosed' });
      }}
      label="New session"
    >
      {starting !== null && (
        <ClosedOnStart onStarted={() => send({ _tag: 'Closed' })} />
      )}
      {starter && <Starter.view instance={starter} />}
    </Drawer>
  );
}

/**
 * Closes the Picker once the page changes, as starting the session does:
 * whatever page was open as it opened, the same project's too, never does.
 * The keys go on to the Session's page, as a Project chosen by keys does,
 * never back to the sidebar it was opened from, which would show it again.
 */
function ClosedOnStart({ onStarted }: { readonly onStarted: () => void }) {
  const { route } = useRouter<Route>();
  return <OnMove at={JSON.stringify(route)} onMoved={onStarted} />;
}

/** Once `at` is not what it was first drawn with: the keys go to the page, then `onMoved`. */
export function OnMove({
  at,
  onMoved,
}: {
  readonly at: string;
  readonly onMoved: () => void;
}) {
  const { enter } = keys.useKeyboard();
  const before = useRef(at);
  const moved = at !== before.current;
  useEffect(() => {
    if (!moved) return;
    enter('content');
    onMoved();
  }, [moved]);
  return null;
}
