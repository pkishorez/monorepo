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
 * View the shell keeps whatever the sidebar shows;
 * the Button, the plus beside the sidebar's Projects, opens it by pointer
 * as a popover by it. On a phone, where the sidebar is the whole screen,
 * the plus floats in its bottom right corner, under the thumb. A tap opens
 * it in a tall Drawer, its folders too, each tapped into. A folder made without its git repository
 * says so over the page until dismissed.
 */

export const ProjectPickerView = View.make(
  ProjectPickerLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const picker = () => open(() => send({ _tag: 'Open', how: 'keys' }));
    keys.useAction('app.projects', picker);
    keys.useAction('app.projectsAnywhere', picker);
    return (
      <Picker.Frame
        how={model.picking === 'keys' ? 'keys' : null}
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
        how={model.picking === 'keys' ? null : model.picking}
        mode="drawer"
        tall
        label="Open a project"
        onOpen={(how) => send({ _tag: 'Open', how })}
        side="bottom"
        className="w-96"
        // On a phone it floats at the bottom right. Wider, it sits in the
        // Projects heading: 24px with a keyboard, a finger's 44px without,
        // its plus as small either way.
        trigger={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Open a project"
            title={
              bound === null ? 'Open a project' : `Open a project (${bound})`
            }
            className="size-11 text-muted-foreground keyboard:md:size-6 max-md:fixed max-md:right-[max(1.25rem,env(safe-area-inset-right))] max-md:bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] max-md:z-20 max-md:size-14 max-md:rounded-full max-md:bg-primary max-md:text-primary-foreground max-md:shadow-lg max-md:hover:bg-primary/90 max-md:active:scale-95 max-md:[&_svg]:size-6!"
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
