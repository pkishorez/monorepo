import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { PlusIcon } from 'lucide-react';
import { keys, useBound } from '../../commands.ts';
import * as Picker from '../../../../../ui/controls/picker/index.ts';
import { ProjectsLive, ListView } from './actor.ts';

/*
 * The Project Picker: `o` opens it centred from anywhere, drawn by the
 * View the frame keeps whatever the sidebar shows, as does a button that
 * runs its keys, such as home's "Open a folder", in a Drawer when tapped;
 * the Button, the round plus at the right of the sidebar's foot, opens it
 * by pointer as a popover above it, and by a tap in a tall Drawer, its
 * folders too, each tapped into. A Project picked there opens its new
 * session's page, as it does by keys.
 */

export const ProjectsView = View.make(
  ProjectsLive,
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
        {children.picker && <ListView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);

export const ProjectsButton = View.make(
  ProjectsLive,
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
        {children.picker && <ListView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
