import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  PlusIcon,
  TriangleAlertIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { keys, useBound } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { ProjectPickerLive, ProjectsView } from './actor.ts';

/*
 * The Project Picker: `o` opens it centred from anywhere, drawn by the
 * View the shell keeps whatever the sidebar shows, as does a button that
 * runs its keys, such as home's "Open a folder", in a Drawer when tapped;
 * the Button, the round plus at the right of the sidebar's foot, opens it
 * by pointer as a popover above it, and by a tap in a tall Drawer, its
 * folders too, each tapped into. A folder made without its git repository
 * says so over the page until dismissed.
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
        label="Open a project"
      >
        {children.picker && <ProjectsView instance={children.picker} />}
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
        label="Open a project"
        onOpen={(how) => send({ _tag: 'Open', how, byButton: true })}
        side="top"
        className="w-96"
        // Round, 56px on a phone and 44px wider, sinking as it is pressed.
        trigger={
          <Button
            aria-label="Open a project"
            title={
              bound === null ? 'Open a project' : `Open a project (${bound})`
            }
            className="size-14 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.16),0_6px_20px_rgb(0_0_0/0.22)] transition-[transform,box-shadow,background-color] duration-150 ease-out active:scale-90 active:shadow-[0_1px_2px_rgb(0_0_0/0.16)] motion-reduce:transition-none md:size-11 [&_svg]:size-6! md:[&_svg]:size-5!"
          >
            <PlusIcon aria-hidden />
          </Button>
        }
      >
        {children.picker && <ProjectsView instance={children.picker} />}
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
